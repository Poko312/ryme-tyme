import { shuffled, type Rng } from "../random";
import type { Difficulty, PromptWord, ThemeSetting } from "./types";

/** If a theme+difficulty combination has fewer words than this, widen to all difficulties. */
export const MIN_POOL_SIZE = 8;

export interface WordFilter {
  difficulty: Difficulty;
  theme: ThemeSetting;
}

/** Words matching the settings, widened if the exact match is too small to stay fresh. */
export function wordPool(words: readonly PromptWord[], filter: WordFilter): PromptWord[] {
  const inTheme = filter.theme === "random" ? [...words] : words.filter((w) => w.themes.includes(filter.theme as never));
  const exact = inTheme.filter((w) => w.difficulty === filter.difficulty);
  if (exact.length >= MIN_POOL_SIZE) return exact;
  if (inTheme.length >= MIN_POOL_SIZE) {
    // keep the requested difficulty first so it still dominates
    return [...exact, ...inTheme.filter((w) => w.difficulty !== filter.difficulty)];
  }
  return inTheme.length > 0 ? inTheme : [...words];
}

/**
 * Picks `count` words with no repeats until the pool is used up (a "shuffle bag"), and never
 * the same word twice in a row across refills.
 */
export function pickWordSequence(words: readonly PromptWord[], filter: WordFilter, count: number, rng: Rng): PromptWord[] {
  const pool = wordPool(words, filter);
  if (pool.length === 0 || count <= 0) return [];
  const out: PromptWord[] = [];
  while (out.length < count) {
    let bag = shuffled(pool, rng);
    const last = out[out.length - 1];
    if (last && bag.length > 1 && bag[0].word === last.word) bag = [...bag.slice(1), bag[0]];
    out.push(...bag.slice(0, count - out.length));
  }
  return out;
}
