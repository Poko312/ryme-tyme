"use client";

import { useActionState } from "react";
import { formatDuration } from "@lib/beats/library";
import { buttonClass } from "@/components/ui";
import { deleteBeat, setBeatPublished, updateBeat, type BeatFormState } from "./actions";
import { BeatFields } from "./BeatFields";

export interface AdminBeat {
  id: string;
  title: string;
  producer: string;
  bpm: number;
  genre: string;
  mood: string;
  firstDownbeatSeconds: number;
  durationSeconds: number;
  isPremium: boolean;
  isPublished: boolean;
  isPlaceholder: boolean;
}

export function AdminBeatRow({ beat, genres, moods }: { beat: AdminBeat; genres: string[]; moods: string[] }) {
  const [editState, editAction, saving] = useActionState<BeatFormState, FormData>(updateBeat, {});
  const [deleteState, deleteAction, deleting] = useActionState<BeatFormState, FormData>(deleteBeat, {});

  return (
    <li className={`rounded-2xl border-2 bg-panel p-4 ${beat.isPublished ? "border-line" : "border-dashed border-line opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-bold">{beat.title}</p>
        {beat.isPremium && <Badge className="bg-gold/15 text-gold">Premium</Badge>}
        {beat.isPlaceholder && <Badge className="bg-cyan/15 text-cyan">Placeholder</Badge>}
        {!beat.isPublished && <Badge className="bg-danger/15 text-danger">Hidden</Badge>}
      </div>
      <p className="text-sm text-dim">
        {beat.producer} · {beat.bpm} BPM · {formatDuration(beat.durationSeconds)} · {beat.genre} · {beat.mood}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <form action={setBeatPublished}>
          <input type="hidden" name="id" value={beat.id} />
          <input type="hidden" name="publish" value={String(!beat.isPublished)} />
          <button type="submit" className={buttonClass("secondary", "min-h-11 px-4 text-sm")}>
            {beat.isPublished ? "Hide from library" : "Publish"}
          </button>
        </form>
        <form
          action={deleteAction}
          onSubmit={(e) => {
            if (!confirm(`Delete “${beat.title}” permanently?`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={beat.id} />
          <button type="submit" disabled={deleting} className={buttonClass("ghost", "min-h-11 px-4 text-sm text-danger")}>
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </form>
      </div>
      {deleteState.error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{deleteState.error}</p>}

      <details className="mt-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-gold">Edit details</summary>
        <form action={editAction} className="mt-3 flex flex-col gap-4">
          <input type="hidden" name="id" value={beat.id} />
          <BeatFields idPrefix={beat.id} values={beat} genres={genres} moods={moods} />
          {editState.error && <p role="alert" className="text-sm font-semibold text-danger">{editState.error}</p>}
          {editState.success && !saving && <p role="status" className="text-sm font-semibold text-gold">{editState.success}</p>}
          <button type="submit" disabled={saving} className={buttonClass("primary", "w-full")}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </details>
    </li>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${className}`}>{children}</span>
  );
}
