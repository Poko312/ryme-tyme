import { describe, expect, it } from "vitest";
import {
  audibleTime,
  beatStartTime,
  countInClickTimes,
  positionAt,
  secondsPerBar,
  secondsPerBeat,
  sessionEndTime,
  totalBars,
  wordChangeTime,
  wordCount,
  type SessionTiming,
} from "./beatClock";

// 90 BPM: 1 beat = 0.6667 s, 1 bar = 2.6667 s. 32-bar beat = 85.333 s.
const timing = (over: Partial<SessionTiming> = {}): SessionTiming => ({
  bpm: 90,
  beatsPerBar: 4,
  wordEveryBars: 4,
  countInStart: 10,
  countInBars: 1,
  beatPlayableSeconds: (32 * 4 * 60) / 90,
  ...over,
});

describe("tempo math", () => {
  it("converts BPM to beat and bar lengths", () => {
    expect(secondsPerBeat(120)).toBe(0.5);
    expect(secondsPerBar(120)).toBe(2);
    expect(secondsPerBar(90)).toBeCloseTo(2.6667, 4);
  });

  it("counts whole bars, tolerating float error on exact lengths", () => {
    expect(totalBars(timing())).toBe(32);
    expect(totalBars(timing({ beatPlayableSeconds: 85.3 }))).toBe(31);
  });
});

describe("count-in", () => {
  it("clicks once per beat for one bar, then the beat starts on the next downbeat", () => {
    const t = timing({ bpm: 120, countInStart: 1 });
    expect(countInClickTimes(t)).toEqual([1, 1.5, 2, 2.5]);
    expect(beatStartTime(t)).toBe(3);
  });
});

describe("word schedule", () => {
  it("lands words on downbeats every N bars", () => {
    const t = timing({ bpm: 120, countInStart: 0 }); // bar = 2 s, beat starts at 2 s
    expect(wordChangeTime(t, 0)).toBe(2);
    expect(wordChangeTime(t, 1)).toBe(10); // 4 bars later
    expect(wordChangeTime({ ...t, wordEveryBars: 2 }, 1)).toBe(6);
    expect(wordChangeTime({ ...t, wordEveryBars: 8 }, 1)).toBe(18);
  });

  it("covers the whole beat with enough words", () => {
    expect(wordCount(timing({ wordEveryBars: 4 }))).toBe(8);
    expect(wordCount(timing({ wordEveryBars: 8 }))).toBe(4);
    expect(wordCount(timing({ wordEveryBars: 4, beatPlayableSeconds: 30 * secondsPerBar(90) }))).toBe(8); // 7.5 → 8
  });

  it("does not drift: word 500 is exactly where the formula says", () => {
    const t = timing({ bpm: 93.7, countInStart: 123.456, beatPlayableSeconds: 1e6 });
    const bar = secondsPerBar(93.7);
    let summed = beatStartTime(t);
    for (let i = 0; i < 500; i++) summed += 4 * bar; // what a setInterval-style approach would accumulate
    expect(wordChangeTime(t, 500)).toBeCloseTo(beatStartTime(t) + 2000 * bar, 9);
    expect(Math.abs(wordChangeTime(t, 500) - summed)).toBeLessThan(1e-6);
  });
});

describe("positionAt", () => {
  const t = timing({ bpm: 120, countInStart: 0, beatPlayableSeconds: 64 }); // count-in 0–2 s, beat 2–66 s (32 bars)

  it("is waiting before the count-in", () => {
    expect(positionAt(t, -0.1).phase).toBe("waiting");
  });

  it("counts in 1-2-3-4 and previews word 0", () => {
    expect(positionAt(t, 0).countInBeat).toBe(1);
    expect(positionAt(t, 0.49).countInBeat).toBe(1);
    expect(positionAt(t, 0.5).countInBeat).toBe(2);
    expect(positionAt(t, 1.99)).toMatchObject({ phase: "countin", countInBeat: 4, wordIndex: 0 });
  });

  it("switches word exactly on the downbeat", () => {
    expect(positionAt(t, 9.999)).toMatchObject({ phase: "playing", bar: 3, beatInBar: 3, wordIndex: 0 });
    expect(positionAt(t, 10)).toMatchObject({ phase: "playing", bar: 4, beatInBar: 0, wordIndex: 1 });
  });

  it("reports progress toward the next word", () => {
    expect(positionAt(t, 2).progressToNextWord).toBe(0);
    expect(positionAt(t, 6).progressToNextWord).toBeCloseTo(0.5, 9);
  });

  it("ends when the beat runs out", () => {
    expect(sessionEndTime(t)).toBe(66);
    expect(positionAt(t, 65.99).phase).toBe("playing");
    expect(positionAt(t, 66)).toMatchObject({ phase: "ended", wordIndex: 7 });
  });

  it("caps the last word's progress at the end of the beat when bars don't divide evenly", () => {
    const short = timing({ bpm: 120, countInStart: 0, beatPlayableSeconds: 6 * 2 }); // 6 bars, words at bar 0 and 4
    expect(wordCount(short)).toBe(2);
    expect(positionAt(short, 12).progressToNextWord).toBeCloseTo(0.5, 9); // halfway through bars 4–6
  });
});

describe("audibleTime", () => {
  it("shifts visuals back by the output latency", () => {
    expect(audibleTime(10, 0.2)).toBeCloseTo(9.8, 9);
    expect(audibleTime(10, -1)).toBe(10);
  });
});
