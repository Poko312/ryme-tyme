"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDefaultEdits, normalizeEdits, type RecordingEdits } from "@lib/editing/edits";
import { mixDuration } from "@lib/playback/schedule";
import { secondsPerBeat } from "@lib/timing/beatClock";
import { getAudioContext } from "@/audio/context";
import { buttonClass } from "@/components/ui";
import type { EditorLayer, LayerControls, LayerTake } from "@/editor/LayersSection";
import { RecordingEditor } from "@/editor/RecordingEditor";
import { baseMimeType, extensionFor } from "@/recording/markerRecorder";
import { saveRecordingEdits, type PlaybackInfo } from "@/recordings/actions";
import { addLayer, deleteLayer, getLayerStatus, updateLayer } from "@/recordings/layers";
import { createClient } from "@/supabase/browser";

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

export function EditRecording({ id, info, isPremium, layerLimit }: { id: string; info: PlaybackInfo; isPremium: boolean; layerLimit: number }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [edits, setEdits] = useState<RecordingEdits | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layers, setLayers] = useState<EditorLayer[]>([]);
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      decode(info.beatUrl),
      decode(info.vocalUrl),
      Promise.all(info.layers.map(async (l) => ({ id: l.id, label: l.label, offset: l.offset, gain: l.gain, muted: l.muted, buffer: await decode(l.url) }))),
    ])
      .then(([beat, vocal, loadedLayers]) => {
        if (cancelled) return;
        const duration = mixDuration({ beatFirstDownbeat: info.beatFirstDownbeat, beatDuration: beat.duration, vocalOffset: info.vocalOffset, vocalDuration: vocal.duration });
        const savedEdits = normalizeEdits(info.edits, duration, secondsPerBeat(info.bpm));
        setLoaded({ beat, vocal, savedEdits });
        setEdits(savedEdits);
        setLayers(loadedLayers);
      })
      .catch((err) => {
        console.error("[edit] load failed", err);
        if (!cancelled) setLoadError("Couldn't load this recording. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, [info]);

  // ---- Layers save as soon as they change (they're separate from the Save edits button).

  const onRecorded = useCallback(
    async (take: LayerTake): Promise<string | null> => {
      const status = await getLayerStatus(id);
      if (!status) return "You've been logged out. Log in again.";
      if (status.count >= status.limit) return "You've reached your layer limit for this recording.";
      const path = `${status.userId}/layers/${crypto.randomUUID()}.${extensionFor(take.mimeType)}`;
      const mime = baseMimeType(take.mimeType);
      const upload = await createClient().storage.from("recordings").upload(path, take.blob, { contentType: mime });
      if (upload.error) return "Upload failed. Check your connection and try again.";
      const label = `Layer ${status.count + 1}`;
      const result = await addLayer({
        recordingId: id,
        label,
        vocalPath: path,
        mimeType: mime as "audio/mp4" | "audio/webm" | "audio/ogg",
        durationSeconds: take.buffer.duration,
        offsetSeconds: take.offset,
        latencySeconds: take.latency,
      });
      if (!result.ok) return result.limitReached ? "You've reached your layer limit for this recording." : result.error;
      setLayers((prev) => [...prev, { id: result.id, label, buffer: take.buffer, offset: take.offset, gain: 1, muted: false }]);
      return null;
    },
    [id],
  );

  const layerControls: LayerControls = {
    limit: layerLimit,
    onRecorded,
    onUpdate: (layerId, patch) => {
      setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, ...patch } : l)));
      // Debounce so dragging a volume slider sends one request.
      const timers = saveTimers.current;
      clearTimeout(timers.get(layerId));
      timers.set(layerId, setTimeout(() => void updateLayer(layerId, patch), 500));
    },
    onDelete: (layerId) => {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || !confirm(`Delete “${layer.label}”?`)) return;
      setLayers((prev) => prev.filter((l) => l.id !== layerId));
      void deleteLayer(layerId).then((r) => {
        if (!r.ok) {
          setError("Couldn't delete that layer. Reload and try again.");
          setLayers((prev) => [...prev, layer]);
        }
      });
    },
  };

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
        isPremium={isPremium}
        layers={layers}
        layerControls={layerControls}
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
