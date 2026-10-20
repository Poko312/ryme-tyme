import {
  beatStartTime,
  countInClickTimes,
  sessionEndTime,
  type SessionTiming,
  type WordEveryBars,
} from "@lib/timing/beatClock";
import { scheduleClick } from "./click";

export interface EngineBeat {
  bpm: number;
  beatsPerBar: number;
  firstDownbeatSeconds: number;
}

/** Small scheduling head start so the first click is never late. */
const START_LEAD_SECONDS = 0.15;

/**
 * Plays one freestyle session: a 1-bar click count-in, then the beat from its first downbeat.
 * Everything is scheduled on the AudioContext clock up front — no timers — so the beat,
 * clicks, and word changes (computed from the same SessionTiming) can't drift apart.
 */
export class FreestyleEngine {
  private source: AudioBufferSourceNode | null = null;
  private clicks: OscillatorNode[] = [];

  constructor(
    private readonly ctx: AudioContext,
    private readonly buffer: AudioBuffer,
    private readonly beat: EngineBeat,
  ) {}

  /** The session timing if it started now (used to size the word list before starting). */
  plan(wordEveryBars: WordEveryBars): SessionTiming {
    return {
      bpm: this.beat.bpm,
      beatsPerBar: this.beat.beatsPerBar,
      wordEveryBars,
      countInStart: this.ctx.currentTime + START_LEAD_SECONDS,
      countInBars: 1,
      beatPlayableSeconds: Math.max(0, this.buffer.duration - this.beat.firstDownbeatSeconds),
    };
  }

  /** Must be called after the context is running (i.e. from a tap). */
  start(timing: SessionTiming, onEnded: () => void): void {
    this.stop();
    const ctx = this.ctx;

    this.clicks = countInClickTimes(timing).map((at, i) => scheduleClick(ctx, at, i % timing.beatsPerBar === 0));

    const source = ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(ctx.destination);
    const start = beatStartTime(timing);
    source.start(start, this.beat.firstDownbeatSeconds, sessionEndTime(timing) - start);
    source.onended = () => {
      if (this.source === source) onEnded();
    };
    this.source = source;
  }

  stop(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
    for (const osc of this.clicks) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
      osc.disconnect();
    }
    this.clicks = [];
  }
}

/**
 * Best estimate of how far the speakers lag the audio clock. Step 4 adds a user calibration
 * that replaces this.
 */
export function estimatedOutputLatency(ctx: AudioContext): number {
  const output = Number.isFinite(ctx.outputLatency) ? ctx.outputLatency : 0;
  const base = Number.isFinite(ctx.baseLatency) ? ctx.baseLatency : 0;
  return output + base;
}
