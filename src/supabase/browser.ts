import { createBrowserClient } from "@supabase/ssr";
import { supabasePublishableKey, supabaseUrl } from "./env";

/** Supabase client for Client Components. Acts as the signed-in user (RLS applies). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
