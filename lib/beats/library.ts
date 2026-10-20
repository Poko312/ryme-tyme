/** Beat library rules shared by web and (later) mobile. */

export interface BeatSummary {
  id: string;
  title: string;
  producer: string;
  bpm: number;
  genre: string;
  mood: string;
  durationSeconds: number;
  firstDownbeatSeconds: number;
  isPremium: boolean;
}

export interface BeatFilter {
  genre: string | null;
  mood: string | null;
}

/** Free users can play free beats; premium users can play everything. */
export function canPlayBeat(beat: Pick<BeatSummary, "isPremium">, viewerIsPremium: boolean): boolean {
  return !beat.isPremium || viewerIsPremium;
}

export function filterBeats<T extends Pick<BeatSummary, "genre" | "mood">>(beats: T[], filter: BeatFilter): T[] {
  return beats.filter(
    (b) => (!filter.genre || b.genre === filter.genre) && (!filter.mood || b.mood === filter.mood),
  );
}

/** Distinct values for a filter row, alphabetical. */
export function distinctValues<T>(beats: T[], key: keyof T): string[] {
  return [...new Set(beats.map((b) => String(b[key])))].sort((a, b) => a.localeCompare(b));
}

/** 85.3 → "1:25" */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const PREVIEW_SECONDS = 15;
export const PREVIEW_FADE_SECONDS = 1.5;

/** Where in the file a preview starts and how long it lasts (never past the end). */
export function previewWindow(beat: Pick<BeatSummary, "durationSeconds" | "firstDownbeatSeconds">): {
  offset: number;
  duration: number;
} {
  const offset = Math.min(Math.max(0, beat.firstDownbeatSeconds), Math.max(0, beat.durationSeconds - 1));
  return { offset, duration: Math.min(PREVIEW_SECONDS, beat.durationSeconds - offset) };
}

/**
 * Seconds of leading silence in decoded audio — used by the admin upload form to suggest
 * the first-downbeat offset. `samples` is one channel; threshold is linear amplitude.
 */
export function detectLeadingSilence(samples: ArrayLike<number>, sampleRate: number, threshold = 0.02): number {
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) return i / sampleRate;
  }
  return 0;
}
