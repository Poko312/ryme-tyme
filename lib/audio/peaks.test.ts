import { describe, expect, it } from "vitest";
import { computePeaks, normalizePeaks } from "./peaks";

describe("computePeaks", () => {
  it("takes the loudest sample per bucket", () => {
    expect(computePeaks([0.1, -0.5, 0.2, 0.3, -0.9, 0], 3)).toEqual([0.5, 0.3, 0.9]);
  });

  it("handles more buckets than samples", () => {
    expect(computePeaks([0.5], 3)).toEqual([0.5, 0.5, 0.5]);
  });

  it("handles empty input", () => {
    expect(computePeaks([], 4)).toEqual([0, 0, 0, 0]);
  });
});

describe("normalizePeaks", () => {
  it("scales the loudest to 1", () => {
    expect(normalizePeaks([0.1, 0.2])).toEqual([0.5, 1]);
    expect(normalizePeaks([0, 0])).toEqual([0, 0]);
  });
});
