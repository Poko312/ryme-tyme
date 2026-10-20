"use client";

import type { FreestyleSettings } from "@lib/session/settings";
import { FreestyleSettingsForm } from "./FreestyleSettingsForm";
import { useFreestyleSettings } from "./useFreestyleSettings";

export function FreestyleSettingsSection({ initial }: { initial: FreestyleSettings }) {
  const { settings, update, saved } = useFreestyleSettings(initial);
  return (
    <section className="rounded-2xl border-2 border-line bg-panel p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-dim">Freestyle</h2>
        <span className="text-xs text-dim" aria-live="polite">{saved ? "Saved" : "Saving…"}</span>
      </div>
      <div className="mt-4">
        <FreestyleSettingsForm settings={settings} onChange={update} />
      </div>
    </section>
  );
}
