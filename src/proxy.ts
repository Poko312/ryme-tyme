import type { NextRequest } from "next/server";
import { updateSession } from "@/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static files, images, and audio.
    "/((?!_next/static|_next/image|favicon.ico|placeholder-beats/|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|wav|m4a|webmanifest)$).*)",
  ],
};
