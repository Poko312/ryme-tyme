"use client";

import type { FreestyleSettings } from "@lib/session/settings";
import { WORD_FREQUENCIES } from "@lib/timing/beatClock";
import { DIFFICULTIES, THEMES, type ThemeSetting } from "@lib/words/types";

const pill = (active: boolean) =>
  `min-h-12 rounded-xl border-2 px-4 text-base font-bold capitalize transition active:scale-95 ${
    active ? "border-gold bg-gold text-ink" : "border-line bg-panel text-fg hover:border-dim"
  }`;

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-xs font-bold uppercase tracking-widest text-dim">{label}</legend>
      {hint && <p className="mt-0.5 text-xs text-dim">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

export function FreestyleSettingsForm({
  settings,
  onChange,
}: {
  settings: FreestyleSettings;
  onChange: (patch: Partial<FreestyleSettings>) => void;
}) {
  const themes: ThemeSetting[] = ["random", ...THEMES];
  return (
    <div className="flex flex-col gap-6">
      <Group label="New word every" hint="Words land on the first beat of the bar.">
        {WORD_FREQUENCIES.map((n) => (
          <button key={n} type="button" aria-pressed={settings.wordEveryBars === n} className={`${pill(settings.wordEveryBars === n)} flex-1`}
            onClick={() => onChange({ wordEveryBars: n })}>
            {n} bars
          </button>
        ))}
      </Group>

      <Group label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <button key={d} type="button" aria-pressed={settings.difficulty === d} className={`${pill(settings.difficulty === d)} flex-1`}
            onClick={() => onChange({ difficulty: d })}>
            {d}
          </button>
        ))}
      </Group>

      <Group label="Theme">
        {themes.map((t) => (
          <button key={t} type="button" aria-pressed={settings.theme === t} className={pill(settings.theme === t)}
            onClick={() => onChange({ theme: t })}>
            {t}
          </button>
        ))}
      </Group>

      <label className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border-2 border-line bg-panel px-4">
        <span>
          <span className="block font-bold">Rhyme hints</span>
          <span className="block text-xs text-dim">Show 2–3 words that rhyme with the prompt</span>
        </span>
        <input type="checkbox" role="switch" checked={settings.rhymeHints} onChange={(e) => onChange({ rhymeHints: e.target.checked })}
          className="h-7 w-7 shrink-0 accent-gold" />
      </label>
    </div>
  );
}

export function settingsSummary(s: FreestyleSettings): string[] {
  return [`Every ${s.wordEveryBars} bars`, s.difficulty, s.theme === "random" ? "Any theme" : s.theme, s.rhymeHints ? "Hints on" : "Hints off"];
}
