import { seededRng } from "../random";

/**
 * A reverb impulse response: decaying noise, generated from a fixed seed so live playback and
 * offline video export sound identical. Returns one Float32Array per channel.
 */
export function generateImpulse(sampleRate: number, seconds = 2, decay = 3.5, channels = 2): Float32Array[] {
  const length = Math.max(1, Math.round(sampleRate * seconds));
  const out: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const rng = seededRng(1000 + c);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      data[i] = (rng() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    out.push(data);
  }
  return out;
}
