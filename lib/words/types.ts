export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** "random" is not stored on words — it means "any theme". */
export const THEMES = [
  "money",
  "love",
  "sports",
  "food",
  "city",
  "party",
  "nature",
  "tech",
  "music",
  "hustle",
  "cars",
  "fashion",
] as const;
export type Theme = (typeof THEMES)[number];
export type ThemeSetting = Theme | "random";

export interface PromptWord {
  word: string;
  difficulty: Difficulty;
  themes: Theme[];
  rhymeHints: string[];
}
