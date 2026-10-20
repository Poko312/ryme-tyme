import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/supabase/server";

export interface Viewer {
  id: string;
  email: string | null;
  username: string | null;
  isAdmin: boolean;
  ageConfirmed: boolean;
}

/** The signed-in user with their profile, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
    supabase.from("user_settings").select("is_admin, age_confirmed_at").eq("user_id", user.id).maybeSingle(),
  ]);

  return {
    id: user.id,
    email: user.email ?? null,
    username: profile?.username ?? null,
    isAdmin: settings?.is_admin ?? false,
    ageConfirmed: Boolean(settings?.age_confirmed_at),
  };
});

export function needsOnboarding(viewer: Viewer): boolean {
  return !viewer.username || !viewer.ageConfirmed;
}

/** For pages that need a fully set-up account. */
export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (needsOnboarding(viewer)) redirect("/onboarding");
  return viewer;
}
