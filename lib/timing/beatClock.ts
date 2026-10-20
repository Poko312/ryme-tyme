/**
 * Beat/bar math for a freestyle session. Pure functions on plain seconds, so the same code
 * drives the web (AudioContext clock) and a future mobile app.
 *
 * Timeline of a session (all times on the audio clock):
 *
 *   countInStart ─ 1 bar of clicks ─► beatStart (bar 0 of the beat) ─► … ─► sessionEnd
 *                                     word 0      word 1 at bar N     word 2 at bar 2N …
 */

export const WORD_FREQUENCIES = [2, 4, 8] as const;
export type WordEveryBars = (typeof WORD_FREQUENCIES)[number];

export interface SessionTiming {
  bpm: number;
  beatsPerBar: number;
  /** A new word lands on the downbeat every this many bars. */
  wordEveryBars: WordEveryBars;
  /** Audio-clock time the count-in starts. */
  countInStart: number;
  countInBars: number;
  /** How much of the beat plays, from its first downbeat to the end of the file. */
  beatPlayableSeconds: number;
}

export const secondsPerBeat = (bpm: number) => 60 / bpm;
export const secondsPerBar = (bpm: number, beatsPerBar = 4) => (60 / bpm) * beatsPerBar;

/** Audio-clock time of bar 0 of the beat (right after the count-in). */
export function beatStartTime(t: SessionTiming): number {
  return t.countInStart + t.countInBars * secondsPerBar(t.bpm, t.beatsPerBar);
}

/** Whole bars of the beat that can play. */
export function totalBars(t: SessionTiming): number {
  // small epsilon so a file that is exactly 32 bars long counts as 32, not 31
  return Math.floor(t.beatPlayableSeconds / secondsPerBar(t.bpm, t.beatsPerBar) + 1e-6);
}

export function sessionEndTime(t: SessionTiming): number {
  return beatStartTime(t) + totalBars(t) * secondsPerBar(t.bpm, t.beatsPerBar);
}

/** Number of prompt words needed to cover the whole beat. */
export function wordCount(t: SessionTiming): number {
  return Math.max(1, Math.ceil(totalBars(t) / t.wordEveryBars));
}

/** Audio-clock times of the count-in clicks (one per beat). */
export function countInClickTimes(t: SessionTiming): number[] {
  const spb = secondsPerBeat(t.bpm);
  return Array.from({ length: t.countInBars * t.beatsPerBar }, (_, i) => t.countInStart + i * spb);
}

/**
 * When word `index` appears. Computed by multiplication from the start time (never by adding
 * up intervals), so there is no rounding drift however long the session runs.
 */
export function wordChangeTime(t: SessionTiming, index: number): number {
  return beatStartTime(t) + index * t.wordEveryBars * secondsPerBar(t.bpm, t.beatsPerBar);
}

export type SessionPhase = "waiting" | "countin" | "playing" | "ended";

export interface SessionPosition {
  phase: SessionPhase;
  /** 1-based beat of the count-in (1..4), else 0. */
  countInBeat: number;
  /** 0-based bar of the beat (-1 before the beat starts). */
  bar: number;
  /** 0-based beat within the current bar. */
  beatInBar: number;
  /** Index of the word on screen (word 0 is shown from the count-in onwards). */
  wordIndex: number;
  /** 0..1 progress until the next word lands. */
  progressToNextWord: number;
}

/** Where the session is at audio-clock time `now`. */
export function positionAt(t: SessionTiming, now: number): SessionPosition {
  const spb = secondsPerBeat(t.bpm);
  const bar = secondsPerBar(t.bpm, t.beatsPerBar);
  const start = beatStartTime(t);
  const end = sessionEndTime(t);
  const words = wordCount(t);

  if (now < t.countInStart) {
    return { phase: "waiting", countInBeat: 0, bar: -1, beatInBar: 0, wordIndex: 0, progressToNextWord: 0 };
  }
  if (now < start) {
    const beatsIn = Math.floor((now - t.countInStart) / spb + 1e-9);
    const countInBeat = Math.min(t.countInBars * t.beatsPerBar, beatsIn + 1);
    const progress = (now - t.countInStart) / (start - t.countInStart);
    return {
      phase: "countin",
      countInBeat,
      bar: -1,
      beatInBar: beatsIn % t.beatsPerBar,
      wordIndex: 0,
      progressToNextWord: clamp01(progress),
    };
  }
  if (now >= end) {
    return { phase: "ended", countInBeat: 0, bar: totalBars(t), beatInBar: 0, wordIndex: words - 1, progressToNextWord: 1 };
  }

  const elapsed = now - start;
  const barIndex = Math.floor(elapsed / bar + 1e-9);
  const beatInBar = Math.floor((elapsed - barIndex * bar) / spb + 1e-9) % t.beatsPerBar;
  const wordIndex = Math.min(words - 1, Math.floor(barIndex / t.wordEveryBars));
  const thisWord = wordChangeTime(t, wordIndex);
  const nextWord = Math.min(wordChangeTime(t, wordIndex + 1), end);
  return {
    phase: "playing",
    countInBeat: 0,
    bar: barIndex,
    beatInBar,
    wordIndex,
    progressToNextWord: clamp01((now - thisWord) / (nextWord - thisWord)),
  };
}

/**
 * The audio clock runs ahead of what the listener hears by the output latency (large on
 * Bluetooth headphones). Show visuals for the moment that is actually audible.
 */
export function audibleTime(contextTime: number, outputLatencySeconds: number): number {
  return contextTime - Math.max(0, outputLatencySeconds);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
