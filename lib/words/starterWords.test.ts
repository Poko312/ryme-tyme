import { describe, expect, it } from "vitest";
import { STARTER_WORDS } from "./starterWords";
import { DIFFICULTIES, THEMES } from "./types";

describe("STARTER_WORDS", () => {
  it("has at least 300 words", () => {
    expect(STARTER_WORDS.length).toBeGreaterThanOrEqual(300);
  });

  it("has no duplicate words", () => {
    const seen = new Set<string>();
    const dupes = STARTER_WORDS.map((w) => w.word.toLowerCase()).filter((w) => {
      const dup = seen.has(w);
      seen.add(w);
      return dup;
    });
    expect(dupes).toEqual([]);
  });

  it("uses only known themes and difficulties", () => {
    for (const w of STARTER_WORDS) {
      expect(DIFFICULTIES).toContain(w.difficulty);
      expect(w.themes.length).toBeGreaterThan(0);
      for (const t of w.themes) expect(THEMES).toContain(t);
    }
  });

  it("gives every word 2-3 rhyme hints that are not the word itself", () => {
    for (const w of STARTER_WORDS) {
      expect(w.rhymeHints.length, w.word).toBeGreaterThanOrEqual(2);
      expect(w.rhymeHints.length, w.word).toBeLessThanOrEqual(3);
      expect(w.rhymeHints.map((h) => h.toLowerCase()), w.word).not.toContain(w.word.toLowerCase());
    }
  });

  it("covers every theme and difficulty with enough words", () => {
    for (const d of DIFFICULTIES) {
      expect(STARTER_WORDS.filter((w) => w.difficulty === d).length, d).toBeGreaterThanOrEqual(50);
    }
    for (const t of THEMES) {
      expect(STARTER_WORDS.filter((w) => w.themes.includes(t)).length, t).toBeGreaterThanOrEqual(10);
    }
  });
});
