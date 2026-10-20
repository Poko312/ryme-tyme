"use client";

import { useActionState } from "react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { signUp, type AuthFormState } from "../actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUp, {});

  if (state.checkEmail) {
    return (
      <div className="rounded-2xl border-2 border-gold bg-panel p-5">
        <p className="font-display text-3xl uppercase">Check your email</p>
        <p className="mt-2 text-dim">
          We sent a confirmation link to <span className="font-semibold text-fg">{state.checkEmail}</span>. Tap it
          to finish signing up.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label htmlFor="username" className={labelClass}>Username</label>
        <input id="username" name="username" required minLength={3} maxLength={20} pattern="[A-Za-z0-9_]+"
          autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="mc_yourname" className={inputClass} />
        <p className="mt-1 text-xs text-dim">3–20 characters: letters, numbers, underscores. Shown publicly.</p>
      </div>
      <div>
        <label htmlFor="email" className={labelClass}>Email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className={inputClass} />
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>Password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={inputClass} />
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-panel px-4 py-3">
        <input type="checkbox" name="age_confirmed" required className="h-6 w-6 shrink-0 accent-gold" />
        <span className="text-sm font-semibold">I confirm I am 13 years old or older.</span>
      </label>
      {state.error && <p role="alert" className="text-sm font-semibold text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={buttonClass("primary", "w-full text-lg")}>
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
