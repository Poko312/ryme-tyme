"use client";

import Link from "next/link";
import { useState } from "react";
import { FREE_SAVE_LIMIT } from "@lib/limits/saveLimit";
import { deleteRecording, type SavedRecordingSummary } from "@/recordings/actions";
import { Sheet } from "./Sheet";
import { buttonClass } from "./ui";

/**
 * Paywall shown when a free user tries to save a 4th recording: delete an old one, or upgrade.
 * Deleting here frees a slot without losing the take they're trying to save.
 */
export function SaveLimitModal({
  recordings,
  onFreedSlot,
  onClose,
}: {
  recordings: SavedRecordingSummary[];
  onFreedSlot: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function remove(r: SavedRecordingSummary) {
    if (!confirm(`Delete “${r.title}”? This can't be undone.`)) return;
    setDeleting(r.id);
    setError(null);
    const res = await deleteRecording(r.id);
    setDeleting(null);
    if (res.ok) onFreedSlot();
    else setError("Couldn't delete that one. Try again.");
  }

  return (
    <Sheet title="Your 3 saves are full" onClose={onClose}>
      <p className="text-dim">
        Free accounts keep {FREE_SAVE_LIMIT} recordings. Delete one to save this take, or go Premium for unlimited saves.
      </p>

      <Link href="/upgrade" className={buttonClass("primary", "mt-5 min-h-14 w-full text-lg")}>Go Premium — unlimited saves</Link>

      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-dim">Or delete one</p>
      <ul className="mt-2 flex flex-col gap-2">
        {recordings.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-xl border-2 border-line bg-ink px-4 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{r.title}</p>
              <p className="text-xs text-dim">{new Date(r.createdAt).toLocaleDateString()}</p>
            </div>
            <button type="button" onClick={() => remove(r)} disabled={deleting !== null}
              className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-bold text-danger disabled:opacity-50">
              {deleting === r.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{error}</p>}

      <button type="button" onClick={onClose} className={buttonClass("ghost", "mt-4 w-full")}>Keep this take for now</button>
    </Sheet>
  );
}
