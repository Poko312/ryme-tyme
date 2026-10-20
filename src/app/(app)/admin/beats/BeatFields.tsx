import { inputClass, labelClass } from "@/components/ui";

export interface BeatFieldValues {
  title: string;
  producer: string;
  bpm: number | "";
  genre: string;
  mood: string;
  firstDownbeatSeconds: number;
  isPremium: boolean;
}

/** Shared fields for the upload and edit forms. */
export function BeatFields({
  idPrefix,
  values,
  genres,
  moods,
  onDownbeatChange,
}: {
  idPrefix: string;
  values: BeatFieldValues;
  genres: string[];
  moods: string[];
  onDownbeatChange?: (v: number) => void;
}) {
  const id = (name: string) => `${idPrefix}-${name}`;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={id("title")} className={labelClass}>Title</label>
          <input id={id("title")} name="title" required maxLength={100} defaultValue={values.title} className={inputClass} />
        </div>
        <div>
          <label htmlFor={id("producer")} className={labelClass}>Producer</label>
          <input id={id("producer")} name="producer" required maxLength={100} defaultValue={values.producer} className={inputClass} />
        </div>
        <div>
          <label htmlFor={id("genre")} className={labelClass}>Genre</label>
          <input id={id("genre")} name="genre" required list={id("genres")} defaultValue={values.genre} placeholder="boom bap" className={inputClass} />
          <datalist id={id("genres")}>{genres.map((g) => <option key={g} value={g} />)}</datalist>
        </div>
        <div>
          <label htmlFor={id("mood")} className={labelClass}>Mood</label>
          <input id={id("mood")} name="mood" required list={id("moods")} defaultValue={values.mood} placeholder="hype" className={inputClass} />
          <datalist id={id("moods")}>{moods.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div>
          <label htmlFor={id("bpm")} className={labelClass}>BPM (tempo)</label>
          <input id={id("bpm")} name="bpm" type="number" required min={40} max={220} step="0.01" inputMode="decimal"
            defaultValue={values.bpm} placeholder="90" className={inputClass} />
          <p className="mt-1 text-xs text-dim">Must be exact — prompt words are timed from it.</p>
        </div>
        <div>
          <label htmlFor={id("downbeat")} className={labelClass}>First downbeat (seconds)</label>
          <input id={id("downbeat")} name="firstDownbeatSeconds" type="number" min={0} max={60} step="0.001" inputMode="decimal"
            key={values.firstDownbeatSeconds} defaultValue={values.firstDownbeatSeconds}
            onChange={(e) => onDownbeatChange?.(Number(e.target.value))} className={inputClass} />
          <p className="mt-1 text-xs text-dim">Where bar 1 starts. Skip any intro or silence.</p>
        </div>
      </div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 border-line bg-ink px-4 py-3">
        <input type="checkbox" name="isPremium" defaultChecked={values.isPremium} className="h-6 w-6 accent-gold" />
        <span className="font-semibold">Premium only</span>
      </label>
    </>
  );
}
