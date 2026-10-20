import "server-only";
import { parseFreestyleSettings, type FreestyleSettings } from "@lib/session/settings";
import { createClient } from "@/supabase/server";

export async function getFreestyleSettings(userId: string): Promise<FreestyleSettings> {
  const supabase = await createClient();
  const { data } = await supabase.from("user_settings").select("preferences").eq("user_id", userId).maybeSingle();
  const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
  return parseFreestyleSettings(prefs.freestyle);
}
