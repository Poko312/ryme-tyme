"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatDuration } from "@lib/beats/library";
import { getAudioContext } from "@/audio/context";
import { MixPlayer } from "@/audio/mixPlayer";
import { PlayIcon, SpinnerIcon, StopIcon } from "@/components/icons";
import { inputClass } from "@/components/ui";
import { deleteRecording, getPlayback, renameRecording, type PlaybackInfo } from "@/recordings/actions";

export interface RecordingItem {
  id: string;
  title: string;
  createdAt: string;
  durationSeconds: number;
  beatTitle: string;
}

interface Loaded {
  player: MixPlayer;
  info: PlaybackInfo;
}

async function decode(url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return getAudioContext().decodeAudioData(await res.arrayBuffer());
}

export function RecordingsList({ items, highlightId }: { items: RecordingItem[]; highlightId: string | null }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [word, setWord] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef<Map<string, Loaded>>(new Map());

  // Only one player at a time; free decoded audio when leaving the page.
  useEffect(() => {
    const cache = loaded.current;
    return () => {
      for (const l of cache.values()) l.player.dispose();
      cache.clear();
    };
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const l = loaded.current.get(activeId);
    if (!l) return;
    let frame = 0;
    const tick = () => {
      const pos = l.player.position;
      setProgress(l.player.duration > 0 ? pos / l.player.duration : 0);
      setWord([...l.info.words].reverse().find((w) => w.time <= pos + 0.01)?.word ?? null);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [activeId]);

  async function toggle(id: string) {
    setError(null);
    const ctx = getAudioContext();
    const resuming = ctx.resume(); // inside the tap (iPhone)

    if (activeId === id) {
      loaded.current.get(id)?.player.pause();
      setActiveId(null);
      return;
    }
    if (activeId) loaded.current.get(activeId)?.player.pause();
    setActiveId(null);

    let l = loaded.current.get(id);
    if (!l) {
      setLoadingId(id);
      try {
        const info = await getPlayback(id);
        if (!info) throw new Error("not found");
        const [beat, vocal] = await Promise.all([decode(info.beatUrl), decode(info.vocalUrl)]);
        // Keep memory in check on phones: one decoded recording at a time.
        for (const old of loaded.current.values()) old.player.dispose();
        loaded.current.clear();
        const player = new MixPlayer(ctx, beat, vocal, {
          beatFirstDownbeat: info.beatFirstDownbeat,
          beatDuration: beat.duration,
          vocalOffset: info.vocalOffset,
          vocalDuration: vocal.duration,
        });
        l = { player, info };
        loaded.current.set(id, l);
      } catch (err) {
        console.error("[recordings] load failed", err);
        setError("Couldn't load that recording. Check your connection and try again.");
        return;
      } finally {
        setLoadingId(null);
      }
    }
    await resuming;
    const current = l;
    current.player.onEnded = () => {
      current.player.seek(0);
      setActiveId(null);
      setProgress(0);
    };
    current.player.play();
    setActiveId(id);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <RecordingRow
            key={item.id}
            item={item}
            highlighted={item.id === highlightId}
            playing={activeId === item.id}
            loading={loadingId === item.id}
            progress={activeId === item.id ? progress : 0}
            word={activeId === item.id ? word : null}
            onToggle={() => toggle(item.id)}
            onDeleted={() => {
              loaded.current.get(item.id)?.player.dispose();
              loaded.current.delete(item.id);
              if (activeId === item.id) setActiveId(null);
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function RecordingRow({
  item,
  highlighted,
  playing,
  loading,
  progress,
  word,
  onToggle,
  onDeleted,
}: {
  item: RecordingItem;
  highlighted: boolean;
  playing: boolean;
  loading: boolean;
  progress: number;
  word: string | null;
  onToggle: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTitle() {
    if (title.trim() === item.title) return setEditing(false);
    setBusy(true);
    const res = await renameRecording(item.id, title);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? "Couldn't rename.");
    setError(null);
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete “${item.title}”? This can't be undone.`)) return;
    setBusy(true);
    const res = await deleteRecording(item.id);
    setBusy(false);
    if (!res.ok) return setError("Couldn't delete. Try again.");
    onDeleted();
    router.refresh();
  }

  return (
    <li className={`relative overflow-hidden rounded-2xl border-2 bg-panel ${playing || highlighted ? "border-gold" : "border-line"}`}>
      <div className="flex items-center gap-4 p-4">
        <button type="button" onClick={onToggle} aria-label={playing ? `Pause ${item.title}` : `Play ${item.title}`}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full active:scale-95 ${playing ? "bg-hot text-white" : "bg-gold text-ink"}`}>
          {loading ? <SpinnerIcon /> : playing ? <StopIcon /> : <PlayIcon className="ml-0.5 h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={(e) => { e.preventDefault(); void saveTitle(); }} className="flex gap-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoFocus aria-label="Recording title" className={`${inputClass} min-h-11`} />
              <button type="submit" disabled={busy} className="min-h-11 shrink-0 rounded-xl bg-gold px-3 text-sm font-bold text-ink">Save</button>
            </form>
          ) : (
            <p className="line-clamp-2 text-lg font-bold leading-tight">{item.title}</p>
          )}
          <p className="mt-0.5 truncate text-sm text-dim">
            {playing && word ? <span className="font-bold uppercase text-gold">{word}</span> : item.beatTitle} · {formatDuration(item.durationSeconds)} ·{" "}
            {new Date(item.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      {!editing && (
        <div className="flex border-t border-line text-sm font-bold">
          <button type="button" onClick={() => setEditing(true)} className="min-h-12 flex-1 text-dim hover:text-fg">Rename</button>
          <button type="button" onClick={remove} disabled={busy} className="min-h-12 flex-1 border-l border-line text-danger disabled:opacity-50">
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="px-4 pb-3 text-sm font-semibold text-danger">{error}</p>}
      {playing && (
        <div className="absolute inset-x-0 top-0 h-1 bg-panel-2" aria-hidden="true">
          <div className="h-full bg-hot" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </li>
  );
}
