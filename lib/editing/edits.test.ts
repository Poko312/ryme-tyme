import { describe, expect, it } from "vitest";
import {
  activeWordAt,
  addCut,
  DEFAULT_EDITS,
  isDefaultEdits,
  keptSegments,
  normalizeEdits,
  outputDuration,
  outputToSource,
  removeCut,
  snapToBar,
  sourceToOutput,
  type RecordingEdits,
} from "./edits";

const BAR = 2; // 120 BPM
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

  it("snaps cuts to bar lines and merges overlaps", () => {
    const e = normalizeEdits({ cuts: [{ start: 9.4, end: 12.3 }, { start: 11, end: 15.2 }, { start: 30.2, end: 30.4 }] }, DUR, BAR);
    expect(e.cuts).toEqual([{ start: 10, end: 16 }]); // 30.2–30.4 snaps to nothing and is dropped
  });

  it("keeps cuts inside the trimmed region", () => {
    const e = normalizeEdits({ trim: { start: 4, end: 20 }, cuts: [{ start: 0, end: 6 }, { start: 18, end: 30 }] }, DUR, BAR);
    expect(e.cuts).toEqual([{ start: 4, end: 6 }, { start: 18, end: 20 }]);
  });

  it("refuses cuts that would remove everything", () => {
    expect(normalizeEdits({ cuts: [{ start: 0, end: 40 }] }, DUR, BAR).cuts).toEqual([]);
  });

  it("clamps mix and effects", () => {
    const e = normalizeEdits({ mix: { vocalGain: 9, beatGain: -1 }, effects: { reverb: 2, echo: "x" } }, DUR, BAR);
    expect(e.mix).toEqual({ vocalGain: 2, beatGain: 0 });
    expect(e.effects).toEqual({ reverb: 1, echo: 0 });
  });
});

describe("snapToBar / addCut / removeCut", () => {
  it("snaps to the nearest bar", () => {
    expect(snapToBar(4.9, BAR)).toBe(4);
    expect(snapToBar(5.1, BAR)).toBe(6);
  });

  it("adds a whole-bar cut starting at the current bar", () => {
    const e = addCut(DEFAULT_EDITS, 7.3, 2, DUR, BAR);
    expect(e.cuts).toEqual([{ start: 6, end: 10 }]);
    expect(removeCut(e, 0).cuts).toEqual([]);
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
