"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_EDITS, isDefaultEdits, type RecordingEdits } from "@lib/editing/edits";
import type { RecordedWord } from "@lib/recording/sync";
import type { FreestyleSettings } from "@lib/session/settings";
import { SaveLimitModal } from "@/components/SaveLimitModal";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { RecordingEditor } from "@/editor/RecordingEditor";
import { baseMimeType, extensionFor } from "@/recording/markerRecorder";
import { createRecording, getSaveStatus, type SavedRecordingSummary } from "@/recordings/actions";
import { createClient } from "@/supabase/browser";

export interface RecordingDraft {
  blob: Blob;
  mimeType: string;
  buffer: AudioBuffer;
  /** Beat-timeline position of vocal t=0, latency already removed. */
  vocalOffset: number;
  latency: number;
  calibrated: boolean;
  words: RecordedWord[];
  settings: FreestyleSettings;
}

const NUDGE_LIMIT_MS = 300;

export function RecordingReview({
  draft,
  beat,
  beatBuffer,
  isPremium,
  onDiscard,
}: {
  draft: RecordingDraft;
  beat: { id: string; title: string; bpm: number; firstDownbeatSeconds: number };
  beatBuffer: AudioBuffer;
  isPremium: boolean;
  onDiscard: () => void;
}) {
  const router = useRouter();
  const [nudgeMs, setNudgeMs] = useState(0);
  const [title, setTitle] = useState(() => `${beat.title} · ${new Date().toLocaleDateString()}`);
  const [edits, setEdits] = useState<RecordingEdits>(DEFAULT_EDITS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitRecordings, setLimitRecordings] = useState<SavedRecordingSummary[] | null>(null);

  const offset = draft.vocalOffset + nudgeMs / 1000;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const status = await getSaveStatus();
      if (!status) return setError("You've been logged out. Log in again to save.");
      if (!status.canSave) return setLimitRecordings(status.recordings);

      const mime = baseMimeType(draft.mimeType);
      const path = `${status.userId}/${crypto.randomUUID()}.${extensionFor(draft.mimeType)}`;
      const upload = await createClient().storage.from("recordings").upload(path, draft.blob, { contentType: mime });
      if (upload.error) {
        // Storage rules refuse uploads past the limit too (e.g. saved from another tab meanwhile).
        const again = await getSaveStatus();
        if (again && !again.canSave) return setLimitRecordings(again.recordings);
        return setError("Upload failed. Check your connection and try again.");
      }

      const result = await createRecording({
        beatId: beat.id,
        title,
        vocalPath: path,
        mimeType: mime as "audio/mp4" | "audio/webm" | "audio/ogg",
        durationSeconds: draft.buffer.duration,
        vocalOffsetSeconds: offset,
        latencySeconds: draft.latency,
        wordSequence: draft.words,
        sessionSettings: draft.settings,
        edits: isDefaultEdits(edits) ? null : edits,
      });
      if (!result.ok) {
        if (result.limitReached) {
          const again = await getSaveStatus();
          return setLimitRecordings(again?.recordings ?? []);
        }
        return setError(result.error);
      }
      router.push(`/recordings?saved=${result.id}`);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!confirm("Discard this take? It hasn't been saved.")) return;
    onDiscard();
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-hot">Take recorded</p>
        <h1 className="font-display text-5xl uppercase leading-none">Listen back</h1>
      </header>

      <RecordingEditor
        beatBuffer={beatBuffer}
        vocalBuffer={draft.buffer}
        bpm={beat.bpm}
        beatFirstDownbeat={beat.firstDownbeatSeconds}
        vocalOffset={offset}
        words={draft.words}
        edits={edits}
        onEditsChange={setEdits}
        isPremium={isPremium}
      />

      <section className="rounded-2xl border-2 border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <label htmlFor="nudge" className="text-xs font-bold uppercase tracking-widest text-dim">Sync</label>
          <span className="text-sm font-semibold tabular-nums">
            {nudgeMs === 0 ? "On the beat" : nudgeMs > 0 ? `Voice ${nudgeMs} ms later` : `Voice ${-nudgeMs} ms earlier`}
          </span>
        </div>
        <input id="nudge" type="range" min={-NUDGE_LIMIT_MS} max={NUDGE_LIMIT_MS} step={10} value={nudgeMs}
          onChange={(e) => setNudgeMs(Number(e.target.value))} className="mt-3 h-10 w-full accent-gold" />
        <div className="flex justify-between text-xs text-dim">
          <span>Earlier</span>
          <button type="button" onClick={() => setNudgeMs(0)} className="min-h-8 font-semibold text-gold">Reset</button>
          <span>Later</span>
        </div>
        {!draft.calibrated && (
          <p className="mt-3 text-sm text-dim">
            Voice sounds early or late? Drag the slider — or{" "}
            <Link href="/settings/calibrate" className="font-semibold text-gold underline">calibrate your headphones</Link> once for tighter takes.
          </p>
        )}
      </section>

      <div>
        <label htmlFor="rec-title" className={labelClass}>Title</label>
        <input id="rec-title" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
      </div>

      {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}

      <div className="grid grid-cols-[1fr_2fr] gap-3 pt-2">
        <button type="button" onClick={discard} disabled={saving} className={buttonClass("secondary", "min-h-16")}>Discard</button>
        <button type="button" onClick={save} disabled={saving || !title.trim()} className={buttonClass("primary", "min-h-16 font-display text-2xl uppercase ")}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {limitRecordings && (
        <SaveLimitModal
          recordings={limitRecordings}
          onClose={() => setLimitRecordings(null)}
          onFreedSlot={() => {
            setLimitRecordings(null);
            void save();
          }}
        />
      )}
    </div>
  );
}
