import { describe, expect, it } from "vitest";
import {
  calibrationClickTimes,
  detectOnsets,
  displayLatencyFromRoundTrip,
  estimateRoundTrip,
  MIN_MATCHED_CLAPS,
} from "./calibration";

const SR = 8000;

/** Silence with short "claps" at the given times. */
function clapTrack(seconds: number, claps: number[], level = 0.8, noise = 0.005): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = (Math.sin(i * 12.9898) % 1) * noise;
  for (const t of claps) {
    const start = Math.round(t * SR);
    for (let k = 0; k < SR * 0.05 && start + k < out.length; k++) {
      out[start + k] = level * Math.exp(-k / (SR * 0.01)) * (k % 2 ? 1 : -1);
    }
  }
  return out;
}

describe("detectOnsets", () => {
  it("finds each clap once, despite the ringing tail", () => {
    const onsets = detectOnsets(clapTrack(3, [0.5, 1.1, 1.7]), SR);
    expect(onsets).toHaveLength(3);
    expect(onsets[0]).toBeCloseTo(0.5, 3);
    expect(onsets[2]).toBeCloseTo(1.7, 3);
  });

  it("returns nothing for silence", () => {
    expect(detectOnsets(clapTrack(2, [], 0, 0.001), SR)).toEqual([]);
  });

  it("ignores quiet noise next to loud claps", () => {
    const onsets = detectOnsets(clapTrack(2, [1.0], 0.9, 0.05), SR);
    expect(onsets).toHaveLength(1);
  });
});

describe("estimateRoundTrip", () => {
  const clicks = calibrationClickTimes(1, 8, 0.6);

  it("measures a consistent delay", () => {
    const claps = clicks.map((c) => c + 0.18);
    const est = estimateRoundTrip(clicks, claps);
    expect(est.ok).toBe(true);
    expect(est.matched).toBe(8);
    expect(est.roundTrip).toBeCloseTo(0.18, 6);
  });

  it("uses the median so one sloppy clap doesn't matter", () => {
    const claps = clicks.map((c, i) => c + (i === 3 ? 0.45 : 0.12 + (i % 2) * 0.004));
    const est = estimateRoundTrip(clicks, claps);
    expect(est.ok).toBe(true);
    expect(est.roundTrip!).toBeGreaterThan(0.11);
    expect(est.roundTrip!).toBeLessThan(0.13);
  });

  it("allows claps slightly ahead of the click (people anticipate)", () => {
    const est = estimateRoundTrip(clicks, clicks.map((c) => c - 0.02));
    expect(est.matched).toBe(8);
    expect(est.roundTrip).toBe(0); // clamped
  });

  it("fails when there aren't enough claps", () => {
    const est = estimateRoundTrip(clicks, clicks.slice(0, MIN_MATCHED_CLAPS - 1).map((c) => c + 0.1));
    expect(est.ok).toBe(false);
    expect(est.roundTrip).toBeNull();
  });

  it("flags inconsistent clapping", () => {
    const claps = clicks.map((c, i) => c + (i % 2 ? 0.05 : 0.3));
    expect(estimateRoundTrip(clicks, claps).ok).toBe(false);
  });

  it("works end-to-end from audio", () => {
    const track = clapTrack(7, clicks.map((c) => c + 0.21));
    const est = estimateRoundTrip(clicks, detectOnsets(track, SR));
    expect(est.ok).toBe(true);
    expect(est.roundTrip).toBeCloseTo(0.21, 2);
  });
});

describe("displayLatencyFromRoundTrip", () => {
  it("takes half the round trip", () => {
    expect(displayLatencyFromRoundTrip(0.3)).toBeCloseTo(0.15, 9);
    expect(displayLatencyFromRoundTrip(-1)).toBe(0);
  });
});
