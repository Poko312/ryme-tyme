"use client";

import { useActionState } from "react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { completeOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultUsername }: { defaultUsername: string }) {
  const [state, formAction, pending] = useActionState<OnboardingState, FormData>(completeOnboarding, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="username" className={labelClass}>Pick your MC name</label>
        <input id="username" name="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+"
          defaultValue={defaultUsername} autoCapitalize="none" spellCheck={false} placeholder="mc_yourname" className={inputClass} />
        <p className="mt-1 text-xs text-dim">3–20 characters: letters, numbers, underscores. Shown publicly.</p>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-panel px-4 py-3">
        <input type="checkbox" name="age_confirmed" required className="h-6 w-6 shrink-0 accent-gold" />
        <span className="text-sm font-semibold">I confirm I am 13 years old or older.</span>
      </label>
      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full text-lg")}>
        {pending ? "Saving…" : "Let's go"}
      </button>
    </form>
  );
}
