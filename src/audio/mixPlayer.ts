import { DEFAULT_EDITS, keptSegments, outputDuration, outputToSource, type RecordingEdits } from "@lib/editing/edits";
import { planEditedPlayback, type ScheduledClip } from "@lib/editing/plan";
import { mixDuration, type MixTrack } from "@lib/playback/schedule";
import { createMixGraph, type MixGraph } from "./mixGraph";
import { scheduleClip } from "./scheduleClip";

const START_LEAD = 0.05;

/** An overdub layer: its own audio, placed on the beat timeline, with its own volume. */
export interface PlayerLayer {
  id: string;
  buffer: AudioBuffer;
  offset: number;
  gain: number;
  muted: boolean;
}

/**
 * Plays a beat, the main vocal and any overdub layers together on the beat timeline, with the
 * recording's edits (trim, cuts, levels, effects). `position` is on the *edited* timeline and is
 * read from the audio clock, so the playhead never drifts from what you hear.
 */
export class MixPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private clipGains: GainNode[] = [];
  private graph: MixGraph;
  private layerGains = new Map<string, GainNode>();
  private layers: PlayerLayer[] = [];
  private startedAt = 0;
  private startPos = 0;
  private playing = false;
  private endTimer = 0;
  onEnded: (() => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly beat: AudioBuffer,
    private readonly vocal: AudioBuffer,
    private track: MixTrack,
    private readonly bpm: number,
    private edits: RecordingEdits = DEFAULT_EDITS,
    layers: PlayerLayer[] = [],
  ) {
    this.graph = createMixGraph(ctx, ctx.destination, bpm, edits);
    this.setLayers(layers);
  }

  /** Length of the edited output. */
  get duration(): number {
    return outputDuration(keptSegments(this.edits, mixDuration(this.track)));
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get position(): number {
    if (!this.playing) return this.startPos;
    return Math.min(this.duration, this.startPos + Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  /** Current position mapped back to the beat timeline (for showing the right prompt word). */
  get beatTimelinePosition(): number {
    return outputToSource(this.position, keptSegments(this.edits, mixDuration(this.track)));
  }

  /** Audio-clock time and edited-timeline position of the current playback start (for overdubbing). */
  get anchor(): { contextTime: number; position: number } {
    return { contextTime: this.startedAt, position: this.startPos };
  }

  /** Play from `from` (edited timeline); `stopAt` ends early (used to preview a cut). */
  play(from = this.position >= this.duration - 0.01 ? 0 : this.position, stopAt?: number) {
    this.stopSources();
    const layerTracks = this.layers.map((l) => ({ offset: l.offset, duration: l.buffer.duration }));
    const plan = planEditedPlayback(this.track, this.edits, from, layerTracks);
    const start = Math.max(0, Math.min(from, plan.duration));
    if (plan.clips.length === 0) {
      this.startPos = plan.duration;
      return;
    }
    const when = this.ctx.currentTime + START_LEAD;
    for (const clip of plan.clips) this.schedule(clip, when);
    this.startedAt = when;
    this.startPos = start;
    this.playing = true;

    // End detection from the audio clock (sources from many clips end at different times).
    const endAt = when + (Math.min(plan.duration, stopAt ?? Infinity) - start);
    const check = () => {
      if (!this.playing) return;
      if (this.ctx.currentTime >= endAt) {
        this.playing = false;
        this.startPos = Math.min(this.duration, stopAt ?? this.duration);
        this.stopSources();
        this.onEnded?.();
        return;
      }
      this.endTimer = requestAnimationFrame(check);
    };
    this.endTimer = requestAnimationFrame(check);
  }

  pause() {
    if (!this.playing) return;
    this.startPos = this.position;
    this.playing = false;
    this.stopSources();
  }

  seek(position: number) {
    const p = Math.max(0, Math.min(this.duration, position));
    if (this.playing) this.play(p);
    else this.startPos = p;
  }

  /** Sync nudge: move the vocal on the beat timeline. */
  setVocalOffset(offset: number) {
    this.track = { ...this.track, vocalOffset: offset };
    this.restartIfPlaying();
  }

  /** Levels/effects change smoothly in place; trim/cut changes re-plan playback. */
  setEdits(edits: RecordingEdits) {
    const timelineChanged =
      JSON.stringify(edits.trim) !== JSON.stringify(this.edits.trim) || JSON.stringify(edits.cuts) !== JSON.stringify(this.edits.cuts);
    this.edits = edits;
    this.graph.apply(edits);
    if (timelineChanged) this.restartIfPlaying();
  }

  /** Volume/mute changes apply live; adding or removing a layer re-plans playback. */
  setLayers(layers: PlayerLayer[]) {
    const changedSet = layers.map((l) => `${l.id}@${l.offset}`).join() !== this.layers.map((l) => `${l.id}@${l.offset}`).join();
    this.layers = layers;
    for (const [id, gain] of this.layerGains) {
      if (!layers.some((l) => l.id === id)) {
        gain.disconnect();
        this.layerGains.delete(id);
      }
    }
    for (const layer of layers) {
      let gain = this.layerGains.get(layer.id);
      if (!gain) {
        gain = this.ctx.createGain();
        gain.connect(this.graph.vocalIn); // layers get the same effects as the main vocal
        this.layerGains.set(layer.id, gain);
      }
      gain.gain.setTargetAtTime(layer.muted ? 0 : layer.gain, this.ctx.currentTime, 0.02);
    }
    if (changedSet) this.restartIfPlaying();
  }

  dispose() {
    this.onEnded = null;
    this.playing = false;
    this.stopSources();
    for (const g of this.layerGains.values()) g.disconnect();
    this.layerGains.clear();
    this.graph.dispose();
  }

  private restartIfPlaying() {
    const pos = Math.min(this.position, this.duration);
    if (this.playing) this.play(pos);
    else this.startPos = pos;
  }

  private schedule(clip: ScheduledClip, when: number) {
    let buffer: AudioBuffer;
    let input: AudioNode;
    if (clip.track === "beat") {
      buffer = this.beat;
      input = this.graph.beatIn;
    } else if (clip.track === "vocal") {
      buffer = this.vocal;
      input = this.graph.vocalIn;
    } else {
      const layer = this.layers[clip.layer ?? -1];
      const gain = layer && this.layerGains.get(layer.id);
      if (!layer || !gain) return;
      buffer = layer.buffer;
      input = gain;
    }
    const { source, gain } = scheduleClip(this.ctx, clip, buffer, input, when);
    this.sources.push(source);
    this.clipGains.push(gain);
  }

  private stopSources() {
    cancelAnimationFrame(this.endTimer);
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // not started / already stopped
      }
      s.disconnect();
    }
    for (const g of this.clipGains) g.disconnect();
    this.sources = [];
    this.clipGains = [];
  }
}
