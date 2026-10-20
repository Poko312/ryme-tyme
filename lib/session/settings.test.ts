import { describe, expect, it } from "vitest";
import { DEFAULT_FREESTYLE_SETTINGS, parseFreestyleSettings } from "./settings";

describe("parseFreestyleSettings", () => {
  it("defaults to a word every 4 bars", () => {
    expect(parseFreestyleSettings(undefined)).toEqual(DEFAULT_FREESTYLE_SETTINGS);
    expect(DEFAULT_FREESTYLE_SETTINGS.wordEveryBars).toBe(4);
  });

  it("keeps valid values", () => {
    expect(parseFreestyleSettings({ wordEveryBars: 8, difficulty: "hard", theme: "food", rhymeHints: true })).toEqual({
      wordEveryBars: 8,
      difficulty: "hard",
      theme: "food",
      rhymeHints: true,
    });
  });

  it("replaces invalid values field by field", () => {
    expect(parseFreestyleSettings({ wordEveryBars: 3, difficulty: "insane", theme: "space", rhymeHints: "yes" })).toEqual(
      DEFAULT_FREESTYLE_SETTINGS,
    );
    expect(parseFreestyleSettings({ wordEveryBars: 2, theme: 42 }).wordEveryBars).toBe(2);
  });
});
