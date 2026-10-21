import { describe, expect, it } from "vitest";
import { canAddLayer, FREE_LAYER_LIMIT, layerLimit, PREMIUM_LAYER_LIMIT } from "./layers";

describe("layer limits", () => {
  it("gives free users one layer and Premium more", () => {
    expect(layerLimit("free")).toBe(FREE_LAYER_LIMIT);
    expect(FREE_LAYER_LIMIT).toBe(1);
    expect(layerLimit("premium")).toBeGreaterThan(FREE_LAYER_LIMIT);
  });

  it("blocks adding past the limit", () => {
    expect(canAddLayer("free", 0)).toBe(true);
    expect(canAddLayer("free", 1)).toBe(false);
    expect(canAddLayer("premium", PREMIUM_LAYER_LIMIT - 1)).toBe(true);
    expect(canAddLayer("premium", PREMIUM_LAYER_LIMIT)).toBe(false);
  });
});
