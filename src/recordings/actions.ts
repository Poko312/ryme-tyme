"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSaveAllowance, isSaveLimitError } from "@lib/limits/saveLimit";
import { MAX_RECORDING_SECONDS } from "@lib/recording/sync";
import { getViewer } from "@/auth/viewer";
import { resolveAudioUrls } from "@/beats/audioUrls";
import { createAdminClient } from "@/supabase/admin";
import { createClient } from "@/supabase/server";

export interface SavedRecordingSummary {
  id: string;
  title: string;
  createdAt: string;
}

export interface SaveStatus {
  userId: string;
  canSave: boolean;
  used: number;
  /** null = unlimited (Premium) */
  limit: number | null;
  recordings: SavedRecordingSummary[];
}

/** What the save button needs to know: is there room, and which recordings could be deleted. */
export async function getSaveStatus(): Promise<SaveStatus | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const [{ data: canSave }, { data: rows }] = await Promise.all([
    supabase.rpc("can_save_recording", { uid: viewer.id }),
    supabase.from("recordings").select("id, title, created_at").eq("user_id", viewer.id).order("created_at", { ascending: false }),
  ]);
  const recordings = (rows ?? []).map((r) => ({ id: r.id as string, title: r.title as string, createdAt: r.created_at as string }));
  const allowance = getSaveAllowance(viewer.isPremium ? "premium" : "free", recordings.length);
  return {
    userId: viewer.id,
    // The database is the source of truth; the lib rule mirrors it for display.
    canSave: canSave === true,
    used: recordings.length,
    limit: allowance.limit,
    recordings,
  };
}

const rangeSchema = z.object({ start: z.number().min(0).max(400), end: z.number().min(0).max(400) });

/** Shape check for editor settings (the client normalises them; this guards the database). */
const editsSchema = z.object({
  version: z.literal(1),
  trim: rangeSchema.nullable(),
  cuts: z.array(rangeSchema).max(20),
  mix: z.object({ vocalGain: z.number().min(0).max(2), beatGain: z.number().min(0).max(1.5) }),
  effects: z.object({ reverb: z.number().min(0).max(1), echo: z.number().min(0).max(1) }),
});

const wordSchema = z.object({
  word: z.string().min(1).max(40),
  bar: z.number().int().min(0).max(10_000),
  time: z.number().min(0).max(10_000),
});

const createSchema = z.object({
  beatId: z.uuid(),
  title: z.string().trim().min(1, "Give it a title.").max(80),
  vocalPath: z.string().max(200),
  mimeType: z.enum(["audio/mp4", "audio/webm", "audio/ogg"]),
  durationSeconds: z.number().positive().max(300),
  vocalOffsetSeconds: z.number().min(-60).max(MAX_RECORDING_SECONDS),
  latencySeconds: z.number().min(0).max(5),
  wordSequence: z.array(wordSchema).max(2000),
  sessionSettings: z.object({
    wordEveryBars: z.number().int(),
    difficulty: z.string().max(20),
    theme: z.string().max(20),
    rhymeHints: z.boolean(),
  }),
  edits: editsSchema.nullable(),
});

export type CreateRecordingInput = z.infer<typeof createSchema>;
export type CreateRecordingResult = { ok: true; id: string } | { ok: false; error: string; limitReached?: boolean };

export async function createRecording(input: CreateRecordingInput): Promise<CreateRecordingResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Log in to save recordings." };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const r = parsed.data;
  // The file must be in the user's own folder (storage rules enforce this too).
  if (!r.vocalPath.startsWith(`${viewer.id}/`)) return { ok: false, error: "Invalid upload." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recordings")
    .insert({
      user_id: viewer.id,
      beat_id: r.beatId,
      title: r.title,
      vocal_path: r.vocalPath,
      vocal_mime_type: r.mimeType,
      duration_seconds: Math.round(r.durationSeconds * 100) / 100,
      vocal_offset_seconds: Math.round(r.vocalOffsetSeconds * 10000) / 10000,
      latency_seconds: Math.round(r.latencySeconds * 10000) / 10000,
      word_sequence: r.wordSequence,
      session_settings: r.sessionSettings,
      ...(r.edits ? { edits: r.edits } : {}),
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from("recordings").remove([r.vocalPath]);
    if (isSaveLimitError(error)) return { ok: false, error: "Save limit reached.", limitReached: true };
    if (error.code === "42703") return { ok: false, error: "The database needs the step 5 update (SETUP.md → “Step 5”)." };
    console.error("[recordings] insert failed", error);
    return { ok: false, error: "Couldn't save. Try again." };
  }
  revalidatePath("/recordings");
  return { ok: true, id: data.id as string };
}

export async function deleteRecording(id: string): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer || !z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("vocal_path").eq("id", id).eq("user_id", viewer.id).maybeSingle();
  if (!rec) return { ok: false };
  const { error } = await supabase.from("recordings").delete().eq("id", id).eq("user_id", viewer.id);
  if (error) return { ok: false };
  await supabase.storage.from("recordings").remove([rec.vocal_path as string]);
  revalidatePath("/recordings");
  return { ok: true };
}

export async function renameRecording(id: string, title: string): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  const parsed = z.string().trim().min(1, "Title can't be empty.").max(80, "Keep it under 80 characters.").safeParse(title);
  if (!viewer || !z.uuid().safeParse(id).success) return { ok: false };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("recordings").update({ title: parsed.data }).eq("id", id).eq("user_id", viewer.id);
  if (error) return { ok: false, error: "Couldn't rename. Try again." };
  revalidatePath("/recordings");
  return { ok: true };
}

export interface PlaybackInfo {
  title: string;
  vocalUrl: string;
  beatUrl: string;
  bpm: number;
  beatFirstDownbeat: number;
  vocalOffset: number;
  words: { word: string; time: number }[];
  /** Raw saved edits (normalise with lib/editing before use). */
  edits: unknown;
}

/** Signed URLs + sync info to play one of the viewer's recordings. */
export async function getPlayback(id: string): Promise<PlaybackInfo | null> {
  const viewer = await getViewer();
  if (!viewer || !z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recordings")
    .select("title, vocal_path, vocal_offset_seconds, word_sequence, beat_id, edits")
    .eq("id", id)
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (!rec) return null;

  // The beat may since have been hidden or made Premium; the owner can still hear their recording.
  const { data: beat } = await createAdminClient()
    .from("beats")
    .select("id, audio_path, bpm, first_downbeat_seconds")
    .eq("id", rec.beat_id)
    .maybeSingle();
  if (!beat) return null;

  const [{ data: vocal }, beatUrls] = await Promise.all([
    supabase.storage.from("recordings").createSignedUrl(rec.vocal_path as string, 60 * 60),
    resolveAudioUrls([{ id: beat.id as string, audioPath: beat.audio_path as string }]),
  ]);
  if (!vocal?.signedUrl || !beatUrls[beat.id as string]) return null;

  return {
    title: rec.title as string,
    vocalUrl: vocal.signedUrl,
    beatUrl: beatUrls[beat.id as string],
    bpm: Number(beat.bpm),
    edits: rec.edits ?? null,
    beatFirstDownbeat: Number(beat.first_downbeat_seconds),
    vocalOffset: Number(rec.vocal_offset_seconds),
    words: ((rec.word_sequence ?? []) as { word: string; time: number }[]).map((w) => ({ word: w.word, time: Number(w.time) })),
  };
}

/** Saves editor settings for one of the viewer's recordings (null = back to the original). */
export async function saveRecordingEdits(id: string, edits: unknown): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (!viewer || !z.uuid().safeParse(id).success) return { ok: false, error: "Not allowed." };
  const parsed = editsSchema.nullable().safeParse(edits);
  if (!parsed.success) return { ok: false, error: "Those edits look invalid. Try resetting them." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recordings")
    .update({ edits: parsed.data })
    .eq("id", id)
    .eq("user_id", viewer.id)
    .select("id");
  if (error) {
    if (error.code === "42703") return { ok: false, error: "The database needs the step 5 update (SETUP.md → “Step 5”)." };
    console.error("[recordings] save edits failed", error);
    return { ok: false, error: "Couldn't save your edits. Try again." };
  }
  if (!data?.length) return { ok: false, error: "Recording not found." };
  revalidatePath("/recordings");
  return { ok: true };
}
