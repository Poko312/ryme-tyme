"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { distinctValues, filterBeats, formatDuration, type BeatSummary } from "@lib/beats/library";
import { usePreviewPlayer } from "@/audio/usePreviewPlayer";
import { LockIcon, PlayIcon, SpinnerIcon, StopIcon } from "@/components/icons";

export interface LibraryBeat extends BeatSummary {
  locked: boolean;
  audioUrl: string | null;
}

export function BeatLibrary({ beats }: { beats: LibraryBeat[] }) {
  const [genre, setGenre] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const player = usePreviewPlayer();

  const genres = useMemo(() => distinctValues(beats, "genre"), [beats]);
  const moods = useMemo(() => distinctValues(beats, "mood"), [beats]);
  const visible = filterBeats(beats, { genre, mood });

  if (beats.length === 0) {
    return <p className="rounded-2xl border-2 border-dashed border-line p-5 text-dim">No beats yet. Check back soon.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <FilterRow label="Genre" options={genres} value={genre} onChange={setGenre} />
      <FilterRow label="Mood" options={moods} value={mood} onChange={setMood} />

      {player.error && (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">
          {player.error}
        </p>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line p-5 text-dim">
          No beats match those filters.{" "}
          <button type="button" className="font-semibold text-gold underline" onClick={() => { setGenre(null); setMood(null); }}>
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((beat) => (
            <BeatCard
              key={beat.id}
              beat={beat}
              playing={player.playingId === beat.id}
              loading={player.loadingId === beat.id}
              progress={player.playingId === beat.id ? player.progress : 0}
              onToggle={() => beat.audioUrl && player.toggle(beat, beat.audioUrl)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const chip = (active: boolean) =>
    `min-h-11 shrink-0 rounded-full border-2 px-4 text-sm font-bold capitalize transition ${
      active ? "border-gold bg-gold text-ink" : "border-line bg-panel text-fg hover:border-dim"
    }`;

  return (
    <div role="group" aria-label={`Filter by ${label.toLowerCase()}`}>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-dim">{label}</p>
      {/* Scrolls sideways on phones; negative margin lets chips reach the screen edge. */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        <button type="button" aria-pressed={value === null} className={chip(value === null)} onClick={() => onChange(null)}>
          All
        </button>
        {options.map((o) => (
          <button key={o} type="button" aria-pressed={value === o} className={chip(value === o)} onClick={() => onChange(value === o ? null : o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function BeatCard({
  beat,
  playing,
  loading,
  progress,
  onToggle,
}: {
  beat: LibraryBeat;
  playing: boolean;
  loading: boolean;
  progress: number;
  onToggle: () => void;
}) {
  const roundButton =
    "flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

  return (
    <li className={`relative overflow-hidden rounded-2xl border-2 bg-panel ${playing ? "border-gold" : "border-line"}`}>
      <div className="flex items-center gap-3 p-4">
        {beat.locked ? (
          <Link href="/upgrade" aria-label={`${beat.title} is a Premium beat — upgrade to unlock`} className={`${roundButton} bg-panel-2 text-gold`}>
            <LockIcon />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onToggle}
            disabled={!beat.audioUrl}
            aria-label={playing || loading ? `Stop preview of ${beat.title}` : `Preview ${beat.title}`}
            className={`${roundButton} ${playing ? "bg-hot text-white" : "bg-gold text-ink"} disabled:opacity-40`}
          >
            {loading ? <SpinnerIcon /> : playing ? <StopIcon /> : <PlayIcon className="ml-0.5 h-6 w-6" />}
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-lg font-bold leading-tight">{beat.title}</h2>
          <p className="mt-0.5 truncate text-sm text-dim">{beat.producer}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs font-semibold capitalize text-dim">
            <span>{Math.round(beat.bpm)} BPM</span>·<span>{formatDuration(beat.durationSeconds)}</span>·
            <span>{beat.genre}</span>·<span>{beat.mood}</span>
            {beat.isPremium && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-gold">
                Premium
              </span>
            )}
          </p>
        </div>

        {beat.locked ? (
          <Link href="/upgrade" className="flex min-h-12 shrink-0 items-center rounded-xl px-3 text-sm font-bold text-gold">
            Unlock
          </Link>
        ) : (
          <Link
            href={`/freestyle?beat=${beat.id}`}
            className="flex min-h-12 shrink-0 items-center rounded-xl border-2 border-line px-4 text-sm font-black uppercase tracking-wide hover:border-gold hover:text-gold"
          >
            Use
          </Link>
        )}
      </div>

      {playing && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-panel-2" aria-hidden="true">
          <div className="h-full bg-hot" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </li>
  );
}
