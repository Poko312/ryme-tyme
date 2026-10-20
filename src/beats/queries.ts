import "server-only";
import type { BeatSummary } from "@lib/beats/library";
import { createClient } from "@/supabase/server";

const BEAT_COLUMNS =
  "id, title, producer, bpm, genre, mood, duration_seconds, first_downbeat_seconds, is_premium, audio_path";

/** Server-side beat shape: includes the storage path, which never goes to the browser. */
export interface BeatRecord extends BeatSummary {
  audioPath: string;
}

interface BeatRow {
  id: string;
  title: string;
  producer: string;
  bpm: number | string;
  genre: string;
  mood: string;
  duration_seconds: number | string;
  first_downbeat_seconds: number | string;
  is_premium: boolean;
  audio_path: string;
}

// Postgres numeric columns arrive as strings; convert once here.
function toBeat(row: BeatRow): BeatRecord {
  return {
    id: row.id,
    title: row.title,
    producer: row.producer,
    bpm: Number(row.bpm),
    genre: row.genre,
    mood: row.mood,
    durationSeconds: Number(row.duration_seconds),
    firstDownbeatSeconds: Number(row.first_downbeat_seconds),
    isPremium: row.is_premium,
    audioPath: row.audio_path,
  };
}

/** Published beats: free ones first, then by sort order. */
export async function listPublishedBeats(): Promise<BeatRecord[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("beats")
    .select(BEAT_COLUMNS)
    .eq("is_published", true)
    .order("is_premium", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't load beats: ${error.message}`);
  return (data as BeatRow[]).map(toBeat);
}
