"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { USERNAME_PROBLEM_MESSAGES, normalizeUsername, validateUsername } from "@lib/account/username";
import { safeNext } from "@/auth/safeNext";
import { getSiteUrl } from "@/auth/siteUrl";
import { describeSupabaseError } from "@/supabase/errors";
import { createClient } from "@/supabase/server";

export interface AuthFormState {
  error?: string;
  checkEmail?: string;
}

const emailSchema = z.email({ error: "Enter a valid email address." });
const passwordSchema = z.string().min(8, { error: "Passwords need at least 8 characters." });

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = emailSchema.safeParse(String(formData.get("email") ?? "").trim());
  if (!email.success) return { error: email.error.issues[0].message };

  const password = passwordSchema.safeParse(String(formData.get("password") ?? ""));
  if (!password.success) return { error: password.error.issues[0].message };

  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const problem = validateUsername(username);
  if (problem) return { error: USERNAME_PROBLEM_MESSAGES[problem] };

  if (formData.get("age_confirmed") !== "on") {
    return { error: "You must be 13 or older to use Rhyme Tyme." };
  }

  const supabase = await createClient();
  const { data: available, error: rpcError } = await supabase.rpc("is_username_available", { name: username });
  if (rpcError) return { error: describeSupabaseError("is_username_available", rpcError) };
  if (!available) return { error: "That username is taken. Try another." };

  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email: email.data,
    password: password.data,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/home`,
      data: { username, age_confirmed: true },
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  // If email confirmation is turned off in Supabase, the user is signed in right away.
  if (data.session) redirect("/home");
  return { checkEmail: email.data };
}

export async function logIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyAuthError(error.message) };

  redirect(safeNext(String(formData.get("next") ?? "")));
}

export async function continueWithGoogle(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const next = safeNext(String(formData.get("next") ?? ""));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Wrong email or password.";
  if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link.";
  if (m.includes("already registered")) return "That email already has an account. Try logging in.";
  if (m.includes("rate limit")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("password")) return message;
  return "Something went wrong. Try again.";
}
