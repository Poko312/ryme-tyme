"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isDefaultEdits, normalizeEdits, type RecordingEdits } from "@lib/editing/edits";
import { mixDuration } from "@lib/playback/schedule";
import { secondsPerBeat } from "@lib/timing/beatClock";
import { getAudioContext } from "@/audio/context";
import { buttonClass } from "@/components/ui";
import { RecordingEditor } from "@/editor/RecordingEditor";
import { saveRecordingEdits, type PlaybackInfo } from "@/recordings/actions";

interface Loaded {
  beat: AudioBuffer;
  vocal: AudioBuffer;
  savedEdits: RecordingEdits;
}

async function decode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return getAudioContext().decodeAudioData(await res.arrayBuffer());
}

export function EditRecording({ id, info }: { id: string; info: PlaybackInfo }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [edits, setEdits] = useState<RecordingEdits | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([decode(info.beatUrl), decode(info.vocalUrl)])
      .then(([beat, vocal]) => {
        if (cancelled) return;
        const duration = mixDuration({ beatFirstDownbeat: info.beatFirstDownbeat, beatDuration: beat.duration, vocalOffset: info.vocalOffset, vocalDuration: vocal.duration });
        const savedEdits = normalizeEdits(info.edits, duration, secondsPerBeat(info.bpm));
        setLoaded({ beat, vocal, savedEdits });
        setEdits(savedEdits);
      })
      .catch((err) => {
        console.error("[edit] load failed", err);
        if (!cancelled) setLoadError("Couldn't load this recording. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, [info]);

  const dirty = loaded !== null && edits !== null && JSON.stringify(edits) !== JSON.stringify(loaded.savedEdits);

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function save() {
    if (!edits) return;
    setSaving(true);
    setError(null);
    const res = await saveRecordingEdits(id, isDefaultEdits(edits) ? null : edits);
    setSaving(false);
    if (!res.ok) return setError(res.error ?? "Couldn't save.");
    router.push(`/recordings?saved=${id}`);
  }

  function cancel() {
    if (dirty && !confirm("Leave without saving your edits?")) return;
    router.push("/recordings");
  }

  if (loadError) return <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 font-semibold text-danger">{loadError}</p>;
  if (!loaded || !edits) return <p className="py-16 text-center text-dim">Loading recording…</p>;

  return (
    <>
      <RecordingEditor
        beatBuffer={loaded.beat}
        vocalBuffer={loaded.vocal}
        bpm={info.bpm}
        beatFirstDownbeat={info.beatFirstDownbeat}
        vocalOffset={info.vocalOffset}
        words={info.words}
        edits={edits}
        onEditsChange={setEdits}
      />
      {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="grid grid-cols-[1fr_2fr] gap-3 pt-2">
        <button type="button" onClick={cancel} disabled={saving} className={buttonClass("secondary", "min-h-16")}>Cancel</button>
        <button type="button" onClick={save} disabled={saving || !dirty} className={buttonClass("primary", "min-h-16 font-display text-2xl uppercase ")}>
          {saving ? "Saving…" : dirty ? "Save edits" : "No changes"}
        </button>
      </div>
    </>
  );
}
