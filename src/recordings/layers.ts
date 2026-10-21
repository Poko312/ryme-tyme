"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { layerLimit, LAYER_LIMIT_ERROR_MESSAGE } from "@lib/limits/layers";
import { getViewer } from "@/auth/viewer";
import { createClient } from "@/supabase/server";

export interface LayerInfo {
  id: string;
  label: string;
  url: string;
  offset: number;
  gain: number;
  muted: boolean;
}

/** Who's asking, how many layers this recording has, and the limit for their plan. */
export async function getLayerStatus(recordingId: string): Promise<{ userId: string; count: number; limit: number } | null> {
  const viewer = await getViewer();
  if (!viewer || !z.uuid().safeParse(recordingId).success) return null;
  const supabase = await createClient();
  const { count } = await supabase
    .from("recording_layers")
    .select("id", { count: "exact", head: true })
    .eq("recording_id", recordingId)
    .eq("user_id", viewer.id);
  return { userId: viewer.id, count: count ?? 0, limit: layerLimit(viewer.isPremium || viewer.isAdmin ? "premium" : "free") };
}

const addSchema = z.object({
  recordingId: z.uuid(),
  label: z.string().trim().min(1).max(40),
  vocalPath: z.string().max(200),
  mimeType: z.enum(["audio/mp4", "audio/webm", "audio/ogg"]),
  durationSeconds: z.number().positive().max(300),
  offsetSeconds: z.number().min(-60).max(400),
  latencySeconds: z.number().min(0).max(5),
});

export type AddLayerResult = { ok: true; id: string } | { ok: false; error: string; limitReached?: boolean };

export async function addLayer(input: z.infer<typeof addSchema>): Promise<AddLayerResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Log in to add layers." };
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const l = parsed.data;
  if (!l.vocalPath.startsWith(`${viewer.id}/layers/`)) return { ok: false, error: "Invalid upload." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recording_layers")
    .insert({
      recording_id: l.recordingId,
      user_id: viewer.id,
      label: l.label,
      vocal_path: l.vocalPath,
      vocal_mime_type: l.mimeType,
      duration_seconds: Math.round(l.durationSeconds * 100) / 100,
      vocal_offset_seconds: Math.round(l.offsetSeconds * 10000) / 10000,
      latency_seconds: Math.round(l.latencySeconds * 10000) / 10000,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from("recordings").remove([l.vocalPath]);
    if (error.message.includes(LAYER_LIMIT_ERROR_MESSAGE)) return { ok: false, error: "Layer limit reached.", limitReached: true };
    if (error.code === "42P01" || error.code === "PGRST205") {
      return { ok: false, error: "The database needs the layers update (SETUP.md → Database updates)." };
    }
    console.error("[layers] insert failed", error);
    return { ok: false, error: "Couldn't save the layer. Try again." };
  }
  revalidatePath("/recordings");
  return { ok: true, id: data.id as string };
}

const patchSchema = z.object({
  label: z.string().trim().min(1).max(40).optional(),
  gain: z.number().min(0).max(2).optional(),
  muted: z.boolean().optional(),
});

export async function updateLayer(id: string, patch: z.infer<typeof patchSchema>): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  const parsed = patchSchema.safeParse(patch);
  if (!viewer || !z.uuid().safeParse(id).success || !parsed.success) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("recording_layers").update(parsed.data).eq("id", id).eq("user_id", viewer.id);
  return { ok: !error };
}

export async function deleteLayer(id: string): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer || !z.uuid().safeParse(id).success) return { ok: false };
  const supabase = await createClient();
  const { data: layer } = await supabase.from("recording_layers").select("vocal_path").eq("id", id).eq("user_id", viewer.id).maybeSingle();
  if (!layer) return { ok: false };
  const { error } = await supabase.from("recording_layers").delete().eq("id", id).eq("user_id", viewer.id);
  if (error) return { ok: false };
  await supabase.storage.from("recordings").remove([layer.vocal_path as string]);
  revalidatePath("/recordings");
  return { ok: true };
}
