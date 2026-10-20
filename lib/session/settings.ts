import { WORD_FREQUENCIES, type WordEveryBars } from "../timing/beatClock";
import { DIFFICULTIES, THEMES, type Difficulty, type ThemeSetting } from "../words/types";

export interface FreestyleSettings {
  wordEveryBars: WordEveryBars;
  difficulty: Difficulty;
  theme: ThemeSetting;
  rhymeHints: boolean;
}

export const DEFAULT_FREESTYLE_SETTINGS: FreestyleSettings = {
  wordEveryBars: 4,
  difficulty: "easy",
  theme: "random",
  rhymeHints: false,
};

/** Reads settings from untrusted JSON (e.g. saved preferences), falling back to defaults per field. */
export function parseFreestyleSettings(input: unknown): FreestyleSettings {
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_FREESTYLE_SETTINGS;
  return {
    wordEveryBars: (WORD_FREQUENCIES as readonly unknown[]).includes(o.wordEveryBars)
      ? (o.wordEveryBars as WordEveryBars)
      : d.wordEveryBars,
    difficulty: (DIFFICULTIES as readonly unknown[]).includes(o.difficulty) ? (o.difficulty as Difficulty) : d.difficulty,
    theme: o.theme === "random" || (THEMES as readonly unknown[]).includes(o.theme) ? (o.theme as ThemeSetting) : d.theme,
    rhymeHints: typeof o.rhymeHints === "boolean" ? o.rhymeHints : d.rhymeHints,
  };
}
