import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { canPlayBeat } from "@lib/beats/library";
import { getViewer } from "@/auth/viewer";
import { resolveAudioUrls } from "@/beats/audioUrls";
import { createClient } from "@/supabase/server";

/**
 * Returns a playable URL for a beat's audio, after checking the viewer may play it.
 * Uploaded beats live in a private bucket, so this hands out a short-lived signed URL.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/beats/[id]/audio">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Log in to play beats" }, { status: 401 });

  // RLS hides unpublished beats from non-admins.
  const supabase = await createClient();
  const { data: beat } = await supabase.from("beats").select("audio_path, is_premium").eq("id", id).maybeSingle();
  if (!beat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canPlayBeat({ isPremium: beat.is_premium }, viewer.isPremium || viewer.isAdmin)) {
    return NextResponse.json({ error: "Premium beat", upgrade: true }, { status: 403 });
  }

  const urls = await resolveAudioUrls([{ id, audioPath: beat.audio_path }]);
  if (!urls[id]) return NextResponse.json({ error: "Audio unavailable" }, { status: 500 });
  return NextResponse.json({ url: urls[id] }, { headers: { "Cache-Control": "private, max-age=300" } });
}
