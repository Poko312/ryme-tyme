import "server-only";

interface SupabaseLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Turns a failed Supabase call into a message that says what to fix.
 * Logs the raw error so it shows up in Vercel → Project → Logs.
 */
export function describeSupabaseError(where: string, error: SupabaseLikeError): string {
  console.error(`[supabase] ${where} failed`, error);
  const message = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (error.code === "PGRST202" || error.code === "42883" || message.includes("could not find the function")) {
    return "The database isn't set up yet. Run the SQL files from SETUP.md Part 1, then try again.";
  }
  if (error.code === "PGRST205" || error.code === "42P01" || message.includes("could not find the table")) {
    return "The database tables are missing. Run the SQL files from SETUP.md Part 1, then try again.";
  }
  if (message.includes("invalid api key") || message.includes("no api key") || message.includes("jwt")) {
    return "The Supabase key is wrong. Check NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel (SETUP.md Part 3), then redeploy.";
  }
  if (message.includes("fetch failed") || message.includes("enotfound") || message.includes("network")) {
    return "Can't reach Supabase. Check NEXT_PUBLIC_SUPABASE_URL in Vercel (SETUP.md Part 3), then redeploy.";
  }
  return `Server error${error.code ? ` (${error.code})` : ""}: ${error.message ?? "unknown"}. Try again.`;
}
