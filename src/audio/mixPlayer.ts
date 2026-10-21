import { DEFAULT_EDITS, keptSegments, outputDuration, outputToSource, type RecordingEdits } from "@lib/editing/edits";
import { planEditedPlayback, type ScheduledClip } from "@lib/editing/plan";
import { mixDuration, type MixTrack } from "@lib/playback/schedule";
import { createMixGraph, type MixGraph } from "./mixGraph";
import { scheduleClip } from "./scheduleClip";

const START_LEAD = 0.05;

/**
 * Plays a beat and a vocal recording together on the beat timeline, with the recording's edits
 * (trim, cuts, levels, effects). `position` is on the *edited* timeline and is read from the audio
 * clock, so the playhead never drifts from what you hear.
 */
export class MixPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private clipGains: GainNode[] = [];
  private graph: MixGraph;
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
  ) {
    this.graph = createMixGraph(ctx, ctx.destination, bpm, edits);
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

  /** Play from `from` (edited timeline); `stopAt` ends early (used to preview a cut). */
  play(from = this.position >= this.duration - 0.01 ? 0 : this.position, stopAt?: number) {
    this.stopSources();
    const plan = planEditedPlayback(this.track, this.edits, from);
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

  dispose() {
    this.onEnded = null;
    this.playing = false;
    this.stopSources();
    this.graph.dispose();
  }

  private restartIfPlaying() {
    const pos = Math.min(this.position, this.duration);
    if (this.playing) this.play(pos);
    else this.startPos = pos;
  }

  private schedule(clip: ScheduledClip, when: number) {
    const buffer = clip.track === "beat" ? this.beat : this.vocal;
    const input = clip.track === "beat" ? this.graph.beatIn : this.graph.vocalIn;
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
