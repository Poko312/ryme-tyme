function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in (see SETUP.md).`,
    );
  }
  return value;
}

// NEXT_PUBLIC_* values must be referenced literally so Next.js can inline them in the browser bundle.
// Keep only the origin, so a pasted ".../rest/v1/" endpoint or trailing slash still works.
export const supabaseUrl = () => {
  const raw = required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL).trim();
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL isn't a valid URL. It should look like https://abcd1234.supabase.co`,
    );
  }
};

export const supabasePublishableKey = () =>
  required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
