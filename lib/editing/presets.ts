import type { RecordingEdits, VocalTone } from "./edits";

export type Effects = RecordingEdits["effects"];

export interface EffectPreset {
  id: string;
  label: string;
  /** One-line description shown under the label. */
  hint: string;
  effects: Effects;
  /** Premium-only presets are shown locked to free users. */
  premium?: boolean;
}

/** One-tap effect settings. Presets only change effects — volume levels stay as the user set them. */
export const EFFECT_PRESETS: readonly EffectPreset[] = [
  { id: "clean", label: "Clean", hint: "No effects", effects: { reverb: 0, echo: 0, tone: "clean" } },
  { id: "studio", label: "Studio", hint: "A touch of room", effects: { reverb: 0.18, echo: 0, tone: "clean" } },
  { id: "stadium", label: "Stadium", hint: "Huge and echoey", effects: { reverb: 0.8, echo: 0.3, tone: "clean" } },
  { id: "phone", label: "Phone call", hint: "Lo-fi, tinny", effects: { reverb: 0, echo: 0, tone: "phone" }, premium: true },
  { id: "radio", label: "Radio", hint: "Old-school broadcast", effects: { reverb: 0.1, echo: 0, tone: "radio" }, premium: true },
  { id: "dub", label: "Dub echo", hint: "Echo on every line", effects: { reverb: 0.25, echo: 0.65, tone: "clean" } },
];

/** The preset whose effects exactly match, or null if the user has tweaked the sliders ("Custom"). */
export function matchPreset(effects: Effects): EffectPreset | null {
  return (
    EFFECT_PRESETS.find(
      (p) =>
        Math.abs(p.effects.reverb - effects.reverb) < 0.005 &&
        Math.abs(p.effects.echo - effects.echo) < 0.005 &&
        p.effects.tone === effects.tone,
    ) ?? null
  );
}

/**
 * How each voice tone filters the vocal: band-limit it, then add a little grit.
 * `drive` 0 = no distortion. Shared so web and a future mobile app sound the same.
 */
export const TONE_SETTINGS: Record<VocalTone, { highpassHz: number; lowpassHz: number; drive: number; gain: number }> = {
  clean: { highpassHz: 20, lowpassHz: 20000, drive: 0, gain: 1 },
  phone: { highpassHz: 450, lowpassHz: 3200, drive: 0.6, gain: 1.6 },
  radio: { highpassHz: 220, lowpassHz: 5500, drive: 0.25, gain: 1.25 },
};

/**
 * Soft-clipping curve for a WaveShaperNode (tanh). drive 0 returns null = no shaping.
 */
export function driveCurve(drive: number, size = 1024): Float32Array | null {
  if (drive <= 0) return null;
  const k = 1 + drive * 8;
  const curve = new Float32Array(size);
  const norm = Math.tanh(k);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / norm;
  }
  return curve;
}

/** Voice tones only Premium can use (the Phone call and Radio presets). */
export function isPremiumTone(tone: VocalTone): boolean {
  return tone !== "clean";
}
