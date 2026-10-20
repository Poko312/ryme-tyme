import { describe, expect, it } from "vitest";
import { seededRng } from "../random";
import { MIN_POOL_SIZE, pickWordSequence, wordPool } from "./picker";
import { STARTER_WORDS } from "./starterWords";
import type { PromptWord } from "./types";

describe("wordPool", () => {
  it("filters by theme and difficulty", () => {
    const pool = wordPool(STARTER_WORDS, { theme: "money", difficulty: "easy" });
    expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE);
    for (const w of pool) {
      expect(w.themes).toContain("money");
      expect(w.difficulty).toBe("easy");
    }
  });

  it("uses every theme when the theme is random", () => {
    const pool = wordPool(STARTER_WORDS, { theme: "random", difficulty: "hard" });
    expect(new Set(pool.flatMap((w) => w.themes)).size).toBeGreaterThan(5);
  });

  it("widens tiny pools to all difficulties of the theme, requested difficulty first", () => {
    const pool = wordPool(STARTER_WORDS, { theme: "cars", difficulty: "hard" }); // only 2 hard car words
    expect(pool.length).toBeGreaterThanOrEqual(MIN_POOL_SIZE);
    expect(pool.every((w) => w.themes.includes("cars"))).toBe(true);
    expect(pool[0].difficulty).toBe("hard");
  });
});

describe("pickWordSequence", () => {
  const rng = () => seededRng(42);

  it("returns the requested number of words", () => {
    expect(pickWordSequence(STARTER_WORDS, { theme: "random", difficulty: "easy" }, 25, rng())).toHaveLength(25);
  });

  it("never repeats a word until the pool is exhausted", () => {
    const filter = { theme: "money", difficulty: "easy" } as const;
    const pool = wordPool(STARTER_WORDS, filter);
    const seq = pickWordSequence(STARTER_WORDS, filter, pool.length, rng());
    expect(new Set(seq.map((w) => w.word)).size).toBe(pool.length);
  });

  it("never shows the same word twice in a row, even across refills", () => {
    const tiny: PromptWord[] = ["a", "b"].map((word) => ({ word, difficulty: "easy", themes: ["money"], rhymeHints: [] }));
    for (let seed = 0; seed < 50; seed++) {
      const seq = pickWordSequence(tiny, { theme: "money", difficulty: "easy" }, 20, seededRng(seed));
      for (let i = 1; i < seq.length; i++) expect(seq[i].word).not.toBe(seq[i - 1].word);
    }
  });

  it("is reproducible from a seed", () => {
    const filter = { theme: "random", difficulty: "medium" } as const;
    const a = pickWordSequence(STARTER_WORDS, filter, 10, seededRng(7)).map((w) => w.word);
    const b = pickWordSequence(STARTER_WORDS, filter, 10, seededRng(7)).map((w) => w.word);
    expect(a).toEqual(b);
  });

  it("handles empty input", () => {
    expect(pickWordSequence([], { theme: "random", difficulty: "easy" }, 5, rng())).toEqual([]);
  });
});
