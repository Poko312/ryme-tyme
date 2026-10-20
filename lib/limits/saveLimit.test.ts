import { describe, expect, it } from "vitest";
import { FREE_SAVE_LIMIT, getSaveAllowance, isSaveLimitError } from "./saveLimit";

describe("getSaveAllowance", () => {
  it("lets free users save until they reach the limit", () => {
    expect(getSaveAllowance("free", 0)).toEqual({ canSave: true, limit: 3, remaining: 3 });
    expect(getSaveAllowance("free", 2)).toEqual({ canSave: true, limit: 3, remaining: 1 });
  });

  it("blocks the 4th save for free users", () => {
    expect(FREE_SAVE_LIMIT).toBe(3);
    expect(getSaveAllowance("free", 3)).toEqual({ canSave: false, limit: 3, remaining: 0 });
  });

  it("stays blocked for lapsed premium users who are over the limit", () => {
    expect(getSaveAllowance("free", 12)).toEqual({ canSave: false, limit: 3, remaining: 0 });
  });

  it("never blocks premium users", () => {
    expect(getSaveAllowance("premium", 0).canSave).toBe(true);
    expect(getSaveAllowance("premium", 500)).toEqual({ canSave: true, limit: null, remaining: null });
  });

  it("rejects invalid counts", () => {
    expect(() => getSaveAllowance("free", -1)).toThrow(RangeError);
    expect(() => getSaveAllowance("free", 1.5)).toThrow(RangeError);
  });
});

describe("isSaveLimitError", () => {
  it("recognises the database error", () => {
    expect(isSaveLimitError({ message: "SAVE_LIMIT_REACHED" })).toBe(true);
    expect(isSaveLimitError({ message: "duplicate key" })).toBe(false);
    expect(isSaveLimitError(null)).toBe(false);
  });
});
