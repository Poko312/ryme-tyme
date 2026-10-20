import "server-only";
import { createAdminClient } from "@/supabase/admin";

export const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Turns beat audio paths into playable URLs. Placeholder beats are plain files in /public;
 * uploaded beats are in the private "beats" bucket and get short-lived signed URLs.
 * Callers must already have checked the viewer is allowed to play these beats.
 */
export async function resolveAudioUrls(beats: { id: string; audioPath: string }[]): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  const stored = beats.filter((b) => !b.audioPath.startsWith("/"));
  for (const b of beats) if (b.audioPath.startsWith("/")) urls[b.id] = b.audioPath;
  if (stored.length === 0) return urls;

  const { data, error } = await createAdminClient()
    .storage.from("beats")
    .createSignedUrls(stored.map((b) => b.audioPath), SIGNED_URL_SECONDS);
  if (error || !data) {
    console.error("[beats] signing failed", error);
    return urls;
  }
  data.forEach((signed, i) => {
    if (signed.signedUrl) urls[stored[i].id] = signed.signedUrl;
  });
  return urls;
}
