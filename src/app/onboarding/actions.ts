"use server";

import { redirect } from "next/navigation";
import { USERNAME_PROBLEM_MESSAGES, normalizeUsername, validateUsername } from "@lib/account/username";
import { describeSupabaseError } from "@/supabase/errors";
import { createClient } from "@/supabase/server";

export interface OnboardingState {
  error?: string;
}

export async function completeOnboarding(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const username = normalizeUsername(String(formData.get("username") ?? ""));
  const problem = validateUsername(username);
  if (problem) return { error: USERNAME_PROBLEM_MESSAGES[problem] };

  if (formData.get("age_confirmed") !== "on") {
    return { error: "Sorry — you must be 13 or older to use Rhyme Tyme." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_onboarding", { p_username: username });
  if (error) {
    if (error.message.includes("USERNAME_UNAVAILABLE")) return { error: "That username is taken. Try another." };
    if (error.message.includes("NOT_AUTHENTICATED")) redirect("/login");
    return { error: describeSupabaseError("complete_onboarding", error) };
  }

  redirect("/home");
}
