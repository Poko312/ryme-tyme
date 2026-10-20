import { describe, expect, it } from "vitest";
import {
  canPlayBeat,
  detectLeadingSilence,
  distinctValues,
  filterBeats,
  formatDuration,
  previewWindow,
} from "./library";

const beats = [
  { genre: "trap", mood: "hype" },
  { genre: "boom bap", mood: "gritty" },
  { genre: "trap", mood: "dark" },
];

describe("canPlayBeat", () => {
  it("locks premium beats for free users only", () => {
    expect(canPlayBeat({ isPremium: false }, false)).toBe(true);
    expect(canPlayBeat({ isPremium: true }, false)).toBe(false);
    expect(canPlayBeat({ isPremium: true }, true)).toBe(true);
  });
});

describe("filterBeats", () => {
  it("filters by genre and mood together", () => {
    expect(filterBeats(beats, { genre: null, mood: null })).toHaveLength(3);
    expect(filterBeats(beats, { genre: "trap", mood: null })).toHaveLength(2);
    expect(filterBeats(beats, { genre: "trap", mood: "dark" })).toEqual([{ genre: "trap", mood: "dark" }]);
    expect(filterBeats(beats, { genre: "boom bap", mood: "hype" })).toEqual([]);
  });

  it("lists distinct values alphabetically", () => {
    expect(distinctValues(beats, "genre")).toEqual(["boom bap", "trap"]);
  });
});

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(85.33)).toBe("1:25");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(-3)).toBe("0:00");
  });
});

describe("previewWindow", () => {
  it("starts at the first downbeat and lasts 15 s", () => {
    expect(previewWindow({ durationSeconds: 90, firstDownbeatSeconds: 2 })).toEqual({ offset: 2, duration: 15 });
  });

  it("is shorter for very short beats", () => {
    expect(previewWindow({ durationSeconds: 10, firstDownbeatSeconds: 0 })).toEqual({ offset: 0, duration: 10 });
  });
});

describe("detectLeadingSilence", () => {
  it("finds the first loud sample", () => {
    const samples = new Float32Array(1000);
    samples[441] = 0.5;
    expect(detectLeadingSilence(samples, 44100)).toBeCloseTo(0.01, 5);
  });

  it("returns 0 for silence", () => {
    expect(detectLeadingSilence(new Float32Array(10), 44100)).toBe(0);
  });
});
