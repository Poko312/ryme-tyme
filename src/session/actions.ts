"use server";

import { parseFreestyleSettings, type FreestyleSettings } from "@lib/session/settings";
import { getViewer } from "@/auth/viewer";
import { createClient } from "@/supabase/server";

/** Saves freestyle settings into user_settings.preferences.freestyle (other keys are kept). */
export async function saveFreestyleSettings(input: FreestyleSettings): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const settings = parseFreestyleSettings(input);

  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("preferences").eq("user_id", viewer.id).maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("user_settings")
    .update({ preferences: { ...prefs, freestyle: settings } })
    .eq("user_id", viewer.id);
  if (error) console.error("[settings] save failed", error);
  return { ok: !error };
}
