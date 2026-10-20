import "server-only";
import type { Difficulty, PromptWord, Theme } from "@lib/words/types";
import { createClient } from "@/supabase/server";

/** All active prompt words (a few hundred rows — small enough to send to the browser once). */
export async function listActiveWords(): Promise<PromptWord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("words")
    .select("word, difficulty, themes, rhyme_hints")
    .eq("is_active", true)
    .limit(5000);
  if (error) throw new Error(`Couldn't load words: ${error.message}`);
  return data.map((w) => ({
    word: w.word as string,
    difficulty: w.difficulty as Difficulty,
    themes: w.themes as Theme[],
    rhymeHints: w.rhyme_hints as string[],
  }));
}
