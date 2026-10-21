import { describe, expect, it } from "vitest";
import {
  activeWordAt,
  addCut,
  DEFAULT_EDITS,
  defaultCutSelection,
  isDefaultEdits,
  keptSegments,
  normalizeEdits,
  outputDuration,
  outputToSource,
  removeCut,
  snapToGrid,
  sourceToOutput,
  type RecordingEdits,
} from "./edits";

const BEAT = 0.5; // 120 BPM: the cut grid
const BAR = 2;
const DUR = 40; // 20 bars

const edits = (over: Partial<RecordingEdits>): RecordingEdits => ({ ...DEFAULT_EDITS, ...over });

describe("normalizeEdits", () => {
  it("returns defaults for junk input", () => {
    expect(normalizeEdits(null, DUR, BAR)).toEqual(DEFAULT_EDITS);
    expect(isDefaultEdits(normalizeEdits("nope", DUR, BAR))).toBe(true);
  });

  it("clamps the trim, and drops a trim that keeps everything", () => {
    expect(normalizeEdits({ trim: { start: -5, end: 99 } }, DUR, BAR).trim).toBeNull();
    expect(normalizeEdits({ trim: { start: 3.21, end: 30 } }, DUR, BAR).trim).toEqual({ start: 3.21, end: 30 });
  });

  it("rejects a trim shorter than a second", () => {
    expect(normalizeEdits({ trim: { start: 10, end: 10.5 } }, DUR, BAR).trim).toBeNull();
  });

  it("snaps cuts to the beat grid and merges overlaps", () => {
    const e = normalizeEdits({ cuts: [{ start: 9.4, end: 12.3 }, { start: 11, end: 15.2 }, { start: 30.1, end: 30.2 }] }, DUR, BEAT);
    expect(e.cuts).toEqual([{ start: 9.5, end: 15 }]); // 30.1–30.2 snaps to nothing and is dropped
  });

  it("allows a one-beat cut", () => {
    expect(normalizeEdits({ cuts: [{ start: 3.1, end: 3.6 }] }, DUR, BEAT).cuts).toEqual([{ start: 3, end: 3.5 }]);
  });

  it("keeps cuts inside the trimmed region", () => {
    const e = normalizeEdits({ trim: { start: 4, end: 20 }, cuts: [{ start: 0, end: 6 }, { start: 18, end: 30 }] }, DUR, BEAT);
    expect(e.cuts).toEqual([{ start: 4, end: 6 }, { start: 18, end: 20 }]);
  });

  it("refuses cuts that would remove everything", () => {
    expect(normalizeEdits({ cuts: [{ start: 0, end: 40 }] }, DUR, BAR).cuts).toEqual([]);
  });

  it("clamps mix and effects", () => {
    const e = normalizeEdits({ mix: { vocalGain: 9, beatGain: -1 }, effects: { reverb: 2, echo: "x" } }, DUR, BAR);
    expect(e.mix).toEqual({ vocalGain: 2, beatGain: 0 });
    expect(e.effects).toEqual({ reverb: 1, echo: 0, tone: "clean" });
  });
});

describe("vocal tone", () => {
  it("keeps a valid tone and defaults old/invalid ones to clean", () => {
    expect(normalizeEdits({ effects: { tone: "phone" } }, DUR, BEAT).effects.tone).toBe("phone");
    expect(normalizeEdits({ effects: { reverb: 0.2 } }, DUR, BEAT).effects.tone).toBe("clean");
    expect(normalizeEdits({ effects: { tone: "robot" } }, DUR, BEAT).effects.tone).toBe("clean");
  });
});

describe("snapToGrid / addCut / removeCut / defaultCutSelection", () => {
  it("snaps to the nearest grid line", () => {
    expect(snapToGrid(4.9, BAR)).toBe(4);
    expect(snapToGrid(5.1, BAR)).toBe(6);
    expect(snapToGrid(5.1, BEAT)).toBe(5);
  });

  it("cuts any range, snapped to beats", () => {
    const e = addCut(DEFAULT_EDITS, { start: 7.3, end: 12.8 }, DUR, BEAT);
    expect(e.cuts).toEqual([{ start: 7.5, end: 13 }]);
    expect(removeCut(e, 0).cuts).toEqual([]);
  });

  it("starts the selection at the playhead, inside the trimmed area", () => {
    expect(defaultCutSelection(DEFAULT_EDITS, 10.2, DUR, BEAT)).toEqual({ start: 10, end: 14 });
    const trimmed = { ...DEFAULT_EDITS, trim: { start: 2, end: 12 } };
    const sel = defaultCutSelection(trimmed, 11.9, DUR, BEAT);
    expect(sel.start).toBeGreaterThanOrEqual(2);
    expect(sel.end).toBeLessThanOrEqual(12);
    expect(sel.end - sel.start).toBeGreaterThan(0);
  });
});

describe("edited timeline", () => {
  const e = edits({ trim: { start: 2, end: 30 }, cuts: [{ start: 10, end: 14 }] });
  const segs = keptSegments(e, DUR);

  it("keeps the trimmed region minus cuts", () => {
    expect(segs).toEqual([
      { sourceStart: 2, sourceEnd: 10, outputStart: 0 },
      { sourceStart: 14, sourceEnd: 30, outputStart: 8 },
    ]);
    expect(outputDuration(segs)).toBe(24);
  });

  it("maps output time to the beat timeline across a cut", () => {
    expect(outputToSource(0, segs)).toBe(2);
    expect(outputToSource(7.5, segs)).toBe(9.5);
    expect(outputToSource(8, segs)).toBe(14); // jumps over the cut
    expect(outputToSource(100, segs)).toBe(30);
  });

  it("maps beat-timeline time to output, skipping removed parts", () => {
    expect(sourceToOutput(1, segs)).toBe(0);
    expect(sourceToOutput(12, segs)).toBe(8); // inside the cut → where the next part starts
    expect(sourceToOutput(20, segs)).toBe(14);
    expect(sourceToOutput(35, segs)).toBe(24);
  });

  it("with no edits, the whole mix plays", () => {
    expect(keptSegments(DEFAULT_EDITS, DUR)).toEqual([{ sourceStart: 0, sourceEnd: 40, outputStart: 0 }]);
  });
});

describe("activeWordAt", () => {
  const words = [
    { word: "cash", time: 0 },
    { word: "gold", time: 8 },
    { word: "rich", time: 16 },
  ];
  it("finds the word showing at a time", () => {
    expect(activeWordAt(words, 0)?.word).toBe("cash");
    expect(activeWordAt(words, 9)?.word).toBe("gold");
    expect(activeWordAt(words, 100)?.word).toBe("rich");
    expect(activeWordAt(words, -1)).toBeNull();
  });
});
