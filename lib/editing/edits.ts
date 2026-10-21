/**
 * Non-destructive recording edits. The vocal file is never changed; these settings describe how
 * to play it back. All times are on the beat timeline (0 = the beat's first downbeat), so beat,
 * vocal and prompt words are always trimmed/cut together.
 */

export interface TimeRange {
  start: number;
  end: number;
}

export interface RecordingEdits {
  version: 1;
  /** Keep only this part (null = keep everything). */
  trim: TimeRange | null;
  /** Remove these parts. Always on whole beats, sorted, non-overlapping. */
  cuts: TimeRange[];
  /** Linear gains (1 = unchanged). */
  mix: { vocalGain: number; beatGain: number };
  /** 0 = off, 1 = maximum. */
  effects: { reverb: number; echo: number };
}

export const DEFAULT_EDITS: RecordingEdits = {
  version: 1,
  trim: null,
  cuts: [],
  mix: { vocalGain: 1, beatGain: 0.75 },
  effects: { reverb: 0, echo: 0 },
};

export const EDIT_LIMITS = {
  vocalGain: { min: 0, max: 2 },
  beatGain: { min: 0, max: 1.5 },
  minTrimSeconds: 1,
  maxCuts: 20,
} as const;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const num = (x: unknown, fallback: number) => (typeof x === "number" && Number.isFinite(x) ? x : fallback);
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Nearest grid line. Cuts use a one-beat grid: cutting on whole beats keeps the beat from
 * stuttering at the join, while still being fine enough to remove a single fumbled word.
 */
export function snapToGrid(t: number, gridSeconds: number): number {
  return Math.round(t / gridSeconds) * gridSeconds;
}

/**
 * Cleans edits from any source (UI, saved JSON, untrusted input): clamps values, snaps cuts to
 * the beat grid, merges overlapping cuts, and drops anything that would leave nothing to play.
 * `duration` is the playable length of the un-edited mix; `gridSeconds` is one beat.
 */
export function normalizeEdits(input: unknown, duration: number, gridSeconds: number): RecordingEdits {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const mix = (typeof o.mix === "object" && o.mix ? o.mix : {}) as Record<string, unknown>;
  const fx = (typeof o.effects === "object" && o.effects ? o.effects : {}) as Record<string, unknown>;

  let trim: TimeRange | null = null;
  const t = o.trim as Partial<TimeRange> | null | undefined;
  if (t && typeof t === "object") {
    const start = clamp(num(t.start, 0), 0, duration);
    const end = clamp(num(t.end, duration), 0, duration);
    if (end - start >= EDIT_LIMITS.minTrimSeconds && (start > 0.001 || end < duration - 0.001)) {
      trim = { start: round3(start), end: round3(end) };
    }
  }
  const keepFrom = trim?.start ?? 0;
  const keepTo = trim?.end ?? duration;

  const rawCuts = Array.isArray(o.cuts) ? (o.cuts as Partial<TimeRange>[]) : [];
  const snapped = rawCuts
    .slice(0, EDIT_LIMITS.maxCuts * 2)
    .map((c) => ({
      start: clamp(snapToGrid(num(c?.start, 0), gridSeconds), keepFrom, keepTo),
      end: clamp(snapToGrid(num(c?.end, 0), gridSeconds), keepFrom, keepTo),
    }))
    .filter((c) => c.end - c.start >= gridSeconds * 0.99)
    .sort((a, b) => a.start - b.start);

  const cuts: TimeRange[] = [];
  for (const c of snapped) {
    const last = cuts[cuts.length - 1];
    if (last && c.start <= last.end + 1e-6) last.end = Math.max(last.end, c.end);
    else cuts.push({ ...c });
  }
  // Never cut away everything that's left.
  const cutTotal = cuts.reduce((sum, c) => sum + (c.end - c.start), 0);
  const finalCuts = keepTo - keepFrom - cutTotal < EDIT_LIMITS.minTrimSeconds ? [] : cuts.slice(0, EDIT_LIMITS.maxCuts);

  return {
    version: 1,
    trim,
    cuts: finalCuts.map((c) => ({ start: round3(c.start), end: round3(c.end) })),
    mix: {
      vocalGain: round3(clamp(num(mix.vocalGain, DEFAULT_EDITS.mix.vocalGain), EDIT_LIMITS.vocalGain.min, EDIT_LIMITS.vocalGain.max)),
      beatGain: round3(clamp(num(mix.beatGain, DEFAULT_EDITS.mix.beatGain), EDIT_LIMITS.beatGain.min, EDIT_LIMITS.beatGain.max)),
    },
    effects: {
      reverb: round3(clamp(num(fx.reverb, 0), 0, 1)),
      echo: round3(clamp(num(fx.echo, 0), 0, 1)),
    },
  };
}

export function isDefaultEdits(e: RecordingEdits): boolean {
  return JSON.stringify(e) === JSON.stringify(DEFAULT_EDITS);
}

/** Removes the range [start, end] of the beat timeline (snapped to the beat grid). */
export function addCut(edits: RecordingEdits, range: TimeRange, duration: number, gridSeconds: number): RecordingEdits {
  return normalizeEdits({ ...edits, cuts: [...edits.cuts, range] }, duration, gridSeconds);
}

/** A sensible starting selection for Cut mode: about two bars at `at`, inside the kept area. */
export function defaultCutSelection(edits: RecordingEdits, at: number, duration: number, gridSeconds: number): TimeRange {
  const from = edits.trim?.start ?? 0;
  const to = edits.trim?.end ?? duration;
  const length = Math.min(gridSeconds * 8, Math.max(gridSeconds, (to - from) / 3));
  const start = Math.min(Math.max(from, snapToGrid(at, gridSeconds)), Math.max(from, to - length));
  return { start, end: Math.min(to, start + length) };
}

export function removeCut(edits: RecordingEdits, index: number): RecordingEdits {
  return { ...edits, cuts: edits.cuts.filter((_, i) => i !== index) };
}

// ---------------------------------------------------------------------------
// The edited ("output") timeline
// ---------------------------------------------------------------------------

export interface Segment {
  sourceStart: number;
  sourceEnd: number;
  /** Where this segment starts in the edited output. */
  outputStart: number;
}

/** The parts of the beat timeline that are kept, in order, with their place in the output. */
export function keptSegments(edits: RecordingEdits, duration: number): Segment[] {
  const from = edits.trim?.start ?? 0;
  const to = Math.min(edits.trim?.end ?? duration, duration);
  const segments: Segment[] = [];
  let cursor = from;
  let out = 0;
  for (const cut of edits.cuts) {
    if (cut.end <= cursor || cut.start >= to) continue;
    if (cut.start > cursor) {
      segments.push({ sourceStart: cursor, sourceEnd: cut.start, outputStart: out });
      out += cut.start - cursor;
    }
    cursor = Math.max(cursor, cut.end);
  }
  if (to > cursor) segments.push({ sourceStart: cursor, sourceEnd: to, outputStart: out });
  return segments;
}

export function outputDuration(segments: Segment[]): number {
  const last = segments[segments.length - 1];
  return last ? last.outputStart + (last.sourceEnd - last.sourceStart) : 0;
}

/** Beat-timeline time for a point in the edited output. */
export function outputToSource(output: number, segments: Segment[]): number {
  if (segments.length === 0) return 0;
  for (const s of segments) {
    if (output < s.outputStart + (s.sourceEnd - s.sourceStart)) return s.sourceStart + Math.max(0, output - s.outputStart);
  }
  return segments[segments.length - 1].sourceEnd;
}

/** Output time for a beat-timeline point; removed points map to where the next kept part starts. */
export function sourceToOutput(source: number, segments: Segment[]): number {
  for (const s of segments) {
    if (source < s.sourceStart) return s.outputStart;
    if (source <= s.sourceEnd) return s.outputStart + (source - s.sourceStart);
  }
  return outputDuration(segments);
}

/** The prompt word on screen at a beat-timeline time. */
export function activeWordAt<W extends { time: number }>(words: W[], sourceTime: number): W | null {
  let current: W | null = null;
  for (const w of words) {
    if (w.time <= sourceTime + 1e-3) current = w;
    else break;
  }
  return current;
}
