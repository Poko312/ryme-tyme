import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

/**
 * Service-role client: BYPASSES Row Level Security. Server-only.
 * Use only for trusted work (Stripe webhook, signing audio URLs) — never with user-supplied filters
 * you haven't checked against the current user.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing environment variable SUPABASE_SECRET_KEY (see SETUP.md).");
  }
  return createClient(supabaseUrl(), secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
