import { describe, expect, it } from "vitest";
import type { SessionTiming } from "../timing/beatClock";
import { layerOffsetOnBeatTimeline, recordedWordSequence, vocalOffsetOnBeatTimeline } from "./sync";

describe("vocalOffsetOnBeatTimeline", () => {
  it("maps file time to the beat timeline using the marker, minus latency", () => {
    // Marker played at context time 10.05 and found 0.30 s into the file → file starts at 9.75.
    // Beat bar 0 at 12.0. Round trip 0.1 → vocal t=0 sits at 9.75 − 12.0 − 0.1 = −2.35.
    expect(
      vocalOffsetOnBeatTimeline({ markerContextTime: 10.05, markerFileTime: 0.3, beatStartContextTime: 12, roundTripLatency: 0.1 }),
    ).toBeCloseTo(-2.35, 9);
  });

  it("a sound performed exactly on beat lands exactly on the beat", () => {
    const latency = 0.25;
    const offset = vocalOffsetOnBeatTimeline({ markerContextTime: 5, markerFileTime: 0.5, beatStartContextTime: 7, roundTripLatency: latency });
    // Performer hits bar 0 when they hear it; it reaches the graph `latency` late at context 7.25,
    // i.e. file time 7.25 − 4.5 = 2.75. On the beat timeline: 2.75 + offset should be 0.
    expect(2.75 + offset).toBeCloseTo(0, 9);
  });

  it("ignores negative latency", () => {
    expect(vocalOffsetOnBeatTimeline({ markerContextTime: 1, markerFileTime: 0, beatStartContextTime: 1, roundTripLatency: -3 })).toBe(0);
  });
});

describe("recordedWordSequence", () => {
  const timing: SessionTiming = { bpm: 120, beatsPerBar: 4, wordEveryBars: 4, countInStart: 0, countInBars: 1, beatPlayableSeconds: 64 };
  const words = ["cash", "gold", "rich", "bank"].map((word) => ({ word, difficulty: "easy" as const, themes: [], rhymeHints: [] }));

  it("records bar and time for each word shown", () => {
    expect(recordedWordSequence(words, timing, 9)).toEqual([
      { word: "cash", bar: 0, time: 0 },
      { word: "gold", bar: 4, time: 8 },
      { word: "rich", bar: 8, time: 16 },
    ]);
  });

  it("includes the first word even if stopped during the count-in", () => {
    expect(recordedWordSequence(words, timing, -1)).toEqual([]);
    expect(recordedWordSequence(words, timing, 0)).toHaveLength(1);
  });
});

describe("layerOffsetOnBeatTimeline", () => {
  it("a sound made exactly on beat time 12 lands at 12", () => {
    // Playback of beat time 10 started at context 100. Marker at context 99.6, 0.4 s into the file
    // → file t=0 is context 99.2. Latency 0.15.
    const offset = layerOffsetOnBeatTimeline({
      markerContextTime: 99.6,
      markerFileTime: 0.4,
      playbackStartContextTime: 100,
      playbackStartPosition: 10,
      roundTripLatency: 0.15,
    });
    // Performer hits beat 12 when they hear it: context 102 (+ latency) → file time 102.15 − 99.2 = 2.95.
    expect(2.95 + offset).toBeCloseTo(12, 9);
  });
});
