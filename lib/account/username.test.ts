import { describe, expect, it } from "vitest";
import { normalizeUsername, validateUsername } from "./username";

describe("validateUsername", () => {
  it("accepts simple names", () => {
    expect(validateUsername("mc_flow99")).toBeNull();
  });

  it("normalises case and whitespace", () => {
    expect(normalizeUsername("  MC_Flow ")).toBe("mc_flow");
    expect(validateUsername("  MC_Flow ")).toBeNull();
  });

  it("rejects bad names", () => {
    expect(validateUsername("ab")).toBe("too_short");
    expect(validateUsername("a".repeat(21))).toBe("too_long");
    expect(validateUsername("mc flow")).toBe("invalid_chars");
    expect(validateUsername("mc-flow")).toBe("invalid_chars");
    expect(validateUsername("Admin")).toBe("reserved");
  });
});
