"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/auth/viewer";
import { createClient } from "@/supabase/server";

export interface BeatFormState {
  error?: string;
  success?: string;
}

const beatFields = z.object({
  title: z.string().trim().min(1, "Add a title.").max(100),
  producer: z.string().trim().min(1, "Add the producer's name.").max(100),
  bpm: z.coerce.number().min(40, "BPM must be between 40 and 220.").max(220, "BPM must be between 40 and 220."),
  genre: z.string().trim().toLowerCase().min(1, "Add a genre.").max(40),
  mood: z.string().trim().toLowerCase().min(1, "Add a mood.").max(40),
  firstDownbeatSeconds: z.coerce.number().min(0).max(60),
  isPremium: z.boolean(),
});

const newBeat = beatFields.extend({
  durationSeconds: z.coerce.number().positive("Couldn't read the audio length. Pick the file again."),
  // must be a file name at the bucket root that the browser just uploaded
  audioPath: z.string().regex(/^[0-9a-f-]{36}\.(mp3|m4a|aac|wav|ogg)$/, "Upload failed. Try again."),
});

function readFields(formData: FormData) {
  return {
    title: formData.get("title"),
    producer: formData.get("producer"),
    bpm: formData.get("bpm"),
    genre: formData.get("genre"),
    mood: formData.get("mood"),
    firstDownbeatSeconds: formData.get("firstDownbeatSeconds") || 0,
    isPremium: formData.get("isPremium") === "on",
  };
}

async function requireAdmin() {
  const viewer = await getViewer();
  if (!viewer?.isAdmin) throw new Error("Admins only");
}

export async function createBeat(_prev: BeatFormState, formData: FormData): Promise<BeatFormState> {
  await requireAdmin();
  const parsed = newBeat.safeParse({
    ...readFields(formData),
    durationSeconds: formData.get("durationSeconds"),
    audioPath: formData.get("audioPath"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("beats").insert({
    title: b.title,
    producer: b.producer,
    bpm: b.bpm,
    genre: b.genre,
    mood: b.mood,
    first_downbeat_seconds: b.firstDownbeatSeconds,
    duration_seconds: Math.round(b.durationSeconds * 100) / 100,
    is_premium: b.isPremium,
    audio_path: b.audioPath,
  });
  if (error) {
    // Don't leave an orphaned file behind.
    await supabase.storage.from("beats").remove([b.audioPath]);
    return { error: `Couldn't save the beat: ${error.message}` };
  }

  revalidatePath("/admin/beats");
  revalidatePath("/beats");
  return { success: `“${b.title}” is live in the beat library.` };
}

export async function updateBeat(_prev: BeatFormState, formData: FormData): Promise<BeatFormState> {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  const parsed = beatFields.safeParse(readFields(formData));
  if (!id.success) return { error: "Unknown beat." };
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("beats")
    .update({
      title: b.title,
      producer: b.producer,
      bpm: b.bpm,
      genre: b.genre,
      mood: b.mood,
      first_downbeat_seconds: b.firstDownbeatSeconds,
      is_premium: b.isPremium,
    })
    .eq("id", id.data);
  if (error) return { error: `Couldn't save: ${error.message}` };

  revalidatePath("/admin/beats");
  revalidatePath("/beats");
  return { success: "Saved." };
}

export async function setBeatPublished(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = z.uuid().parse(formData.get("id"));
  const publish = formData.get("publish") === "true";
  const supabase = await createClient();
  await supabase.from("beats").update({ is_published: publish }).eq("id", id);
  revalidatePath("/admin/beats");
  revalidatePath("/beats");
}

export async function deleteBeat(_prev: BeatFormState, formData: FormData): Promise<BeatFormState> {
  await requireAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "Unknown beat." };

  const supabase = await createClient();
  const { data: beat } = await supabase.from("beats").select("audio_path").eq("id", id.data).maybeSingle();
  const { error } = await supabase.from("beats").delete().eq("id", id.data);
  if (error) {
    if (error.code === "23503") {
      return { error: "People have recordings on this beat, so it can't be deleted. Unpublish it instead." };
    }
    return { error: `Couldn't delete: ${error.message}` };
  }
  if (beat && !beat.audio_path.startsWith("/")) {
    await supabase.storage.from("beats").remove([beat.audio_path]);
  }

  revalidatePath("/admin/beats");
  revalidatePath("/beats");
  return {};
}
