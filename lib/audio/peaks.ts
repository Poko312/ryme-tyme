/** Waveform overview: the loudest absolute sample in each of `buckets` equal slices (0..1). */
export function computePeaks(samples: ArrayLike<number>, buckets: number): number[] {
  const out = new Array<number>(Math.max(0, buckets)).fill(0);
  if (samples.length === 0 || buckets <= 0) return out;
  const size = samples.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.max(from + 1, Math.floor((b + 1) * size));
    let peak = 0;
    for (let i = from; i < to && i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    out[b] = Math.min(1, peak);
  }
  return out;
}

/** Scales peaks so the loudest is 1 (quiet recordings still draw a readable waveform). */
export function normalizePeaks(peaks: number[]): number[] {
  const max = Math.max(0, ...peaks);
  return max > 0 ? peaks.map((p) => p / max) : peaks;
}
