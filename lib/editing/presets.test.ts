import { describe, expect, it } from "vitest";
import { DEFAULT_EDITS } from "./edits";
import { driveCurve, EFFECT_PRESETS, matchPreset } from "./presets";

describe("effect presets", () => {
  it("has unique ids and valid values", () => {
    expect(new Set(EFFECT_PRESETS.map((p) => p.id)).size).toBe(EFFECT_PRESETS.length);
    for (const p of EFFECT_PRESETS) {
      expect(p.effects.reverb).toBeGreaterThanOrEqual(0);
      expect(p.effects.reverb).toBeLessThanOrEqual(1);
      expect(p.effects.echo).toBeGreaterThanOrEqual(0);
      expect(p.effects.echo).toBeLessThanOrEqual(1);
    }
  });

  it("recognises the default as Clean, and tweaked values as custom", () => {
    expect(matchPreset(DEFAULT_EDITS.effects)?.id).toBe("clean");
    expect(matchPreset({ reverb: 0.8, echo: 0.3, tone: "clean" })?.id).toBe("stadium");
    expect(matchPreset({ reverb: 0.81, echo: 0.3, tone: "clean" })).toBeNull();
    expect(matchPreset({ reverb: 0, echo: 0, tone: "phone" })?.id).toBe("phone");
  });
});

describe("driveCurve", () => {
  it("is null with no drive, and a symmetric curve ending at ±1 otherwise", () => {
    expect(driveCurve(0)).toBeNull();
    const c = driveCurve(0.5, 101)!;
    expect(c[0]).toBeCloseTo(-1, 6);
    expect(c[100]).toBeCloseTo(1, 6);
    expect(c[50]).toBeCloseTo(0, 6);
    expect(c[25]).toBeCloseTo(-c[75], 6);
  });
});
