import { describe, expect, it } from "vitest";
import { generateImpulse } from "./impulse";

describe("generateImpulse", () => {
  it("is deterministic and decays to silence", () => {
    const a = generateImpulse(8000, 1);
    const b = generateImpulse(8000, 1);
    expect(a).toHaveLength(2);
    expect(a[0]).toEqual(b[0]);
    expect(a[0]).not.toEqual(a[1]); // stereo channels differ
    const start = Math.max(...Array.from(a[0].slice(0, 400), Math.abs));
    const end = Math.max(...Array.from(a[0].slice(-400), Math.abs));
    expect(end).toBeLessThan(start * 0.01);
  });
});
