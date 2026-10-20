/**
 * Latency calibration math.
 *
 * "Round-trip latency" = how late a sound you make *in time with what you hear* shows up in the
 * recording, relative to when the beat was scheduled: output delay (to the headphones) + input
 * delay (from the mic). It's exactly the shift needed to line a vocal up with the beat, so we
 * measure it directly: play clicks, the user claps along, and we time the claps in the mic signal.
 */

export interface OnsetOptions {
  /** Fraction of the loudest peak a sound must reach to count. */
  relativeThreshold?: number;
  /** Ignore new onsets this soon after the previous one (claps ring for a while). */
  minGapSeconds?: number;
  /** Ignore everything quieter than this absolute level (silence/noise). */
  absoluteFloor?: number;
}

/** Times (seconds) where loud, sharp sounds start — claps, taps, "ta"s. */
export function detectOnsets(samples: ArrayLike<number>, sampleRate: number, options: OnsetOptions = {}): number[] {
  const { relativeThreshold = 0.35, minGapSeconds = 0.25, absoluteFloor = 0.02 } = options;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < absoluteFloor) return [];
  const threshold = Math.max(absoluteFloor, peak * relativeThreshold);
  const gap = Math.round(minGapSeconds * sampleRate);

  const onsets: number[] = [];
  let lastOnset = -Infinity;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold && i - lastOnset >= gap) {
      onsets.push(i / sampleRate);
      lastOnset = i;
    }
  }
  return onsets;
}

export interface LatencyEstimate {
  /** Median delay in seconds (null if not enough clean claps). */
  roundTrip: number | null;
  /** How many clicks had a matching clap. */
  matched: number;
  /** Median absolute deviation of the delays — small means consistent claps. */
  spread: number;
  ok: boolean;
}

export const MIN_MATCHED_CLAPS = 5;
export const MAX_SPREAD_SECONDS = 0.035;

/**
 * Pairs each click with the first clap that follows within a plausible window and takes the
 * median delay, which ignores the odd early/late clap.
 */
export function estimateRoundTrip(clickTimes: number[], onsetTimes: number[], maxDelay = 0.6, maxEarly = 0.08): LatencyEstimate {
  const delays: number[] = [];
  const used = new Set<number>();
  for (const click of clickTimes) {
    const idx = onsetTimes.findIndex((t, i) => !used.has(i) && t >= click - maxEarly && t <= click + maxDelay);
    if (idx >= 0) {
      used.add(idx);
      delays.push(onsetTimes[idx] - click);
    }
  }
  if (delays.length < MIN_MATCHED_CLAPS) return { roundTrip: null, matched: delays.length, spread: Infinity, ok: false };
  const m = median(delays);
  const spread = median(delays.map((d) => Math.abs(d - m)));
  return { roundTrip: Math.max(0, m), matched: delays.length, spread, ok: spread <= MAX_SPREAD_SECONDS };
}

/**
 * Visual offset for prompt words. Round trip = output + input delay, and the two are usually
 * similar (both tiny when wired, both large on Bluetooth), so half is a good estimate of the
 * output part alone.
 */
export function displayLatencyFromRoundTrip(roundTrip: number): number {
  return Math.max(0, roundTrip / 2);
}

/** Calibration click pattern: `count` clicks every `interval` seconds starting at `start`. */
export function calibrationClickTimes(start: number, count: number, interval: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i * interval);
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
