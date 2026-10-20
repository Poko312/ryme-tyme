import { secondsPerBar, type SessionTiming } from "../timing/beatClock";
import type { PromptWord } from "../words/types";

/** Recordings may not exceed this (the database enforces 300 s; leave headroom for the pre-roll). */
export const MAX_RECORDING_SECONDS = 295;

/**
 * Where t=0 of the vocal file sits on the beat timeline (0 = the beat's first downbeat).
 *
 * The recorder writes a short marker at a known audio-clock time; finding it in the decoded file
 * ties file time to the audio clock, whatever delay the browser's recorder/encoder added. Then the
 * round-trip latency is removed, because the performer hears the beat late and the mic hears them late.
 */
export function vocalOffsetOnBeatTimeline(input: {
  markerContextTime: number;
  markerFileTime: number;
  beatStartContextTime: number;
  roundTripLatency: number;
}): number {
  const fileStartContextTime = input.markerContextTime - input.markerFileTime;
  return fileStartContextTime - input.beatStartContextTime - Math.max(0, input.roundTripLatency);
}

export interface RecordedWord {
  word: string;
  /** Bar on the beat timeline where the word appeared. */
  bar: number;
  /** Seconds on the beat timeline. */
  time: number;
}

/** The words actually shown, with their bar and beat-timeline time, up to (and including) `lastBar`. */
export function recordedWordSequence(sequence: PromptWord[], timing: SessionTiming, lastBar: number): RecordedWord[] {
  const bar = secondsPerBar(timing.bpm, timing.beatsPerBar);
  const out: RecordedWord[] = [];
  sequence.forEach((w, i) => {
    const wordBar = i * timing.wordEveryBars;
    if (wordBar <= lastBar) out.push({ word: w.word, bar: wordBar, time: round4(wordBar * bar) });
  });
  return out;
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
