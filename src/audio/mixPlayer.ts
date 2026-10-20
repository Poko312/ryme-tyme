import { mixDuration, planPlayback, type MixTrack } from "@lib/playback/schedule";

const START_LEAD = 0.05;

export interface MixLevels {
  beat: number;
  vocal: number;
}

/**
 * Plays a beat and a vocal recording together, lined up on the beat timeline.
 * Position is read from the audio clock, so the playhead never drifts from what you hear.
 */
export class MixPlayer {
  private sources: AudioBufferSourceNode[] = [];
  private beatGain: GainNode;
  private vocalGain: GainNode;
  private startedAt = 0;
  private startPos = 0;
  private playing = false;
  onEnded: (() => void) | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly beat: AudioBuffer,
    private readonly vocal: AudioBuffer,
    private track: MixTrack,
    levels: MixLevels = { beat: 0.75, vocal: 1 },
  ) {
    this.beatGain = ctx.createGain();
    this.vocalGain = ctx.createGain();
    this.beatGain.gain.value = levels.beat;
    this.vocalGain.gain.value = levels.vocal;
    this.beatGain.connect(ctx.destination);
    this.vocalGain.connect(ctx.destination);
  }

  get duration(): number {
    return mixDuration(this.track);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Current position on the beat timeline (seconds). */
  get position(): number {
    if (!this.playing) return this.startPos;
    return Math.min(this.duration, this.startPos + Math.max(0, this.ctx.currentTime - this.startedAt));
  }

  play(from = this.position >= this.duration ? 0 : this.position) {
    this.stopSources();
    const plan = planPlayback(this.track, from);
    if (!plan.beat) {
      this.startPos = plan.end;
      return;
    }
    const when = this.ctx.currentTime + START_LEAD;
    const beatSrc = this.source(this.beat, this.beatGain, when, plan.beat);
    if (plan.vocal) this.source(this.vocal, this.vocalGain, when, plan.vocal);
    beatSrc.onended = () => {
      if (this.sources.includes(beatSrc)) {
        this.playing = false;
        this.startPos = this.duration;
        this.stopSources();
        this.onEnded?.();
      }
    };
    this.startedAt = when;
    this.startPos = Math.max(0, Math.min(from, plan.end));
    this.playing = true;
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

  /** Change where the vocal sits (sync nudge); keeps playing from the same spot. */
  setVocalOffset(offset: number) {
    const pos = this.position;
    this.track = { ...this.track, vocalOffset: offset };
    if (this.playing) this.play(Math.min(pos, this.duration));
    else this.startPos = Math.min(this.startPos, this.duration);
  }

  dispose() {
    this.onEnded = null;
    this.stopSources();
    this.playing = false;
    this.beatGain.disconnect();
    this.vocalGain.disconnect();
  }

  private source(buffer: AudioBuffer, out: AudioNode, when: number, part: { delay: number; fileOffset: number; duration: number }) {
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(out);
    src.start(when + part.delay, part.fileOffset, part.duration);
    this.sources.push(src);
    return src;
  }

  private stopSources() {
    const old = this.sources;
    this.sources = [];
    for (const s of old) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        // not started yet / already stopped
      }
      s.disconnect();
    }
  }
}
