"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computePeaks, normalizePeaks } from "@lib/audio/peaks";
import { formatDuration } from "@lib/beats/library";
import {
  activeWordAt,
  addCut,
  DEFAULT_EDITS,
  defaultCutSelection,
  isDefaultEdits,
  keptSegments,
  normalizeEdits,
  outputDuration,
  outputToSource,
  removeCut,
  sourceToOutput,
  type RecordingEdits,
  type TimeRange,
} from "@lib/editing/edits";
import { EMPTY_HISTORY, recordChange, undo } from "@lib/editing/history";
import { EFFECT_PRESETS, matchPreset } from "@lib/editing/presets";
import { mixDuration } from "@lib/playback/schedule";
import { secondsPerBar, secondsPerBeat } from "@lib/timing/beatClock";
import { getAudioContext } from "@/audio/context";
import { MixPlayer } from "@/audio/mixPlayer";
import { PlayIcon, StopIcon } from "@/components/icons";
import { vocalTimelineSamples } from "@/components/Waveform";
import { nowMs } from "./clock";
import { LayersSection, type EditorLayer, type LayerControls } from "./LayersSection";
import { EditorTimeline, type EditorMode } from "./EditorTimeline";

const ZOOM_LEVELS = [1, 2, 4, 8] as const;
/** Seconds played either side of a cut when previewing it. */
const PREVIEW_LEAD = 2;

export interface EditorWord {
  word: string;
  time: number;
}

/**
 * Trim, cut, mix and effects for one recording. Controlled: the parent owns `edits` and saves them.
 * Shared by the review screen (before saving) and the edit page (after saving).
 */
export function RecordingEditor({
  beatBuffer,
  vocalBuffer,
  bpm,
  beatFirstDownbeat,
  vocalOffset,
  words,
  edits,
  onEditsChange,
  isPremium,
  layers = [],
  layerControls = null,
}: {
  beatBuffer: AudioBuffer;
  vocalBuffer: AudioBuffer;
  bpm: number;
  beatFirstDownbeat: number;
  vocalOffset: number;
  words: EditorWord[];
  edits: RecordingEdits;
  onEditsChange: (edits: RecordingEdits) => void;
  /** Unlocks Premium-only presets (Phone call, Radio). */
  isPremium: boolean;
  layers?: EditorLayer[];
  /** null = layers not available here (e.g. before the take is saved). */
  layerControls?: LayerControls | null;
}) {
  const playerRef = useRef<MixPlayer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0); // on the edited timeline
  const [mode, setMode] = useState<EditorMode>("trim");
  const [selection, setSelection] = useState<TimeRange | null>(null);
  const [zoom, setZoom] = useState<(typeof ZOOM_LEVELS)[number]>(1);
  const [undoCount, setUndoCount] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const historyRef = useRef(EMPTY_HISTORY);
  const editsRef = useRef(edits);
  const previewRef = useRef<{ returnTo: number } | null>(null);
  const [lockedNote, setLockedNote] = useState<string | null>(null);

  const bar = secondsPerBar(bpm);
  const beat = secondsPerBeat(bpm);
  const duration = mixDuration({ beatFirstDownbeat, beatDuration: beatBuffer.duration, vocalOffset, vocalDuration: vocalBuffer.duration });
  const segments = keptSegments(edits, duration);
  const editedDuration = outputDuration(segments);
  // While previewing a cut, the player runs on a timeline that already has the cut applied.
  const playingSegments = previewing && selection ? keptSegments(addCut(edits, selection, duration, beat), duration) : segments;
  const playheadSource = outputToSource(position, playingSegments);

  useEffect(() => {
    const player = new MixPlayer(
      getAudioContext(),
      beatBuffer,
      vocalBuffer,
      { beatFirstDownbeat, beatDuration: beatBuffer.duration, vocalOffset, vocalDuration: vocalBuffer.duration },
      bpm,
      edits,
      layers,
    );
    player.onEnded = () => {
      const preview = previewRef.current;
      if (preview) {
        // End of a cut preview: put the real edits back and return to where we were.
        previewRef.current = null;
        player.setEdits(editsRef.current);
        player.seek(preview.returnTo);
        setPreviewing(false);
        setPlaying(false);
        setPosition(preview.returnTo);
        return;
      }
      player.seek(0);
      setPlaying(false);
      setPosition(0);
    };
    playerRef.current = player;
    return () => player.dispose();
    // The player is created once per recording; later changes are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatBuffer, vocalBuffer, bpm, beatFirstDownbeat]);

  useEffect(() => playerRef.current?.setVocalOffset(vocalOffset), [vocalOffset]);
  useEffect(() => playerRef.current?.setLayers(layers), [layers]);

  useEffect(() => {
    editsRef.current = edits;
    playerRef.current?.setEdits(edits);
  }, [edits]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setPosition(playerRef.current?.position ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const beatDuration = beatBuffer.duration;
  // Expensive (scans the whole vocal), so only when the audio or its position changes.
  const peaks = useMemo(() => {
    const total = mixDuration({ beatFirstDownbeat, beatDuration, vocalOffset, vocalDuration: vocalBuffer.duration });
    return normalizePeaks(computePeaks(vocalTimelineSamples(vocalBuffer, vocalOffset, total), 800));
  }, [vocalBuffer, vocalOffset, beatFirstDownbeat, beatDuration]);
  const word = activeWordAt(words, playheadSource)?.word;
  const activePreset = matchPreset(edits.effects);

  /** Every change goes through here so it can be undone (quick successive changes group together). */
  function apply(next: RecordingEdits) {
    historyRef.current = recordChange(historyRef.current, edits, nowMs());
    setUndoCount(historyRef.current.past.length);
    onEditsChange(next);
  }
  const change = (next: RecordingEdits) => apply(next);
  // Cuts and trims snap to whole beats so the beat never stutters at a join.
  const commit = (next: RecordingEdits) => apply(normalizeEdits(next, duration, beat));

  function undoLast() {
    const result = undo(historyRef.current);
    historyRef.current = result.history;
    setUndoCount(result.history.past.length);
    if (result.edits) onEditsChange(result.edits);
  }

  function stopPreview() {
    const player = playerRef.current;
    const preview = previewRef.current;
    if (!player || !preview) return;
    previewRef.current = null;
    player.pause();
    player.setEdits(editsRef.current);
    player.seek(preview.returnTo);
    setPreviewing(false);
    setPlaying(false);
    setPosition(preview.returnTo);
  }

  /** Plays a couple of seconds either side of the selection, skipping it, to hear the join. */
  async function previewCut() {
    const player = playerRef.current;
    if (!player || !selection) return;
    if (previewRef.current) return stopPreview();
    const resuming = getAudioContext().resume(); // inside the tap (iPhone)
    if (player.isPlaying) player.pause();
    const withCut = addCut(edits, selection, duration, beat);
    const joinAt = sourceToOutput(selection.start, keptSegments(withCut, duration));
    await resuming;
    previewRef.current = { returnTo: player.position };
    player.setEdits(withCut);
    player.play(Math.max(0, joinAt - PREVIEW_LEAD), joinAt + PREVIEW_LEAD);
    setPreviewing(true);
    setPlaying(true);
  }

  async function togglePlay() {
    const player = playerRef.current;
    if (!player) return;
    if (previewRef.current) return stopPreview();
    if (player.isPlaying) {
      player.pause();
      setPlaying(false);
      setPosition(player.position);
    } else {
      await getAudioContext().resume();
      player.play();
      setPlaying(true);
    }
  }

  function seekOutput(out: number) {
    if (previewRef.current) stopPreview();
    playerRef.current?.seek(out);
    setPosition(out);
  }

  const seekSource = (beatTime: number) => seekOutput(sourceToOutput(beatTime, segments));

  function switchMode(next: EditorMode) {
    setMode(next);
    if (next === "cut" && !selection) setSelection(defaultCutSelection(edits, playheadSource, duration, beat));
  }

  function removeSelection() {
    if (!selection) return;
    stopPreview();
    commit(addCut(edits, selection, duration, beat));
    setSelection(null);
    setMode("trim");
  }

  const trimStart = edits.trim?.start ?? 0;
  const trimEnd = edits.trim?.end ?? duration;
  const nudgeTrim = (which: "start" | "end", by: number) =>
    commit({
      ...edits,
      trim: which === "start" ? { start: Math.max(0, trimStart + by), end: trimEnd } : { start: trimStart, end: Math.min(duration, trimEnd + by) },
    });

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border-2 border-line bg-panel p-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => seekOutput(0)} aria-label="Back to the start"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-line text-fg active:scale-95">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 6.2v11.6a1 1 0 0 1-1.5.86L9.6 12.86a1 1 0 0 1 0-1.72l8.9-5.8A1 1 0 0 1 20 6.2Z" /></svg>
          </button>
          <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full active:scale-95 ${playing ? "bg-hot text-white" : "bg-gold text-ink"}`}>
            {playing ? <StopIcon className="h-7 w-7" /> : <PlayIcon className="ml-1 h-7 w-7" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-3xl uppercase text-gold">{word ?? "—"}</p>
            <p className="text-sm tabular-nums text-dim">
              {formatDuration(position)} / {formatDuration(editedDuration)}
              {editedDuration < duration - 0.5 && <span> · edited from {formatDuration(duration)}</span>}
            </p>
          </div>
        </div>

        <input
          type="range"
          aria-label="Position"
          min={0}
          max={Math.max(0.01, editedDuration)}
          step={0.01}
          value={Math.min(position, editedDuration)}
          onChange={(e) => seekOutput(Number(e.target.value))}
          className="mt-4 h-10 w-full accent-fg"
        />

        <div role="radiogroup" aria-label="Editing mode" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-ink p-1">
          {(["trim", "cut"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => switchMode(m)}
              className={`min-h-11 rounded-lg text-sm font-bold transition ${mode === m ? (m === "trim" ? "bg-gold text-ink" : "bg-hot text-white") : "text-dim"}`}>
              {m === "trim" ? "Trim the ends" : "✂ Cut out a part"}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Zoom">
            <button type="button" aria-label="Zoom out" disabled={zoom === 1}
              onClick={() => setZoom(ZOOM_LEVELS[Math.max(0, ZOOM_LEVELS.indexOf(zoom) - 1)])}
              className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-line text-lg font-bold disabled:opacity-30">−</button>
            <span className="w-10 text-center text-sm font-bold tabular-nums">{zoom}×</span>
            <button type="button" aria-label="Zoom in" disabled={zoom === 8}
              onClick={() => setZoom(ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, ZOOM_LEVELS.indexOf(zoom) + 1)])}
              className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-line text-lg font-bold disabled:opacity-30">+</button>
          </div>
          <button type="button" onClick={undoLast} disabled={undoCount === 0}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border-2 border-line px-3 text-sm font-bold disabled:opacity-30">
            <span aria-hidden="true">↶</span> Undo
          </button>
        </div>

        <div className="mt-2">
          <EditorTimeline
            peaks={peaks}
            duration={duration}
            gridSeconds={beat}
            barSeconds={bar}
            edits={edits}
            playhead={playheadSource}
            mode={mode}
            selection={selection}
            onSeek={seekSource}
            onChange={change}
            onSelectionChange={setSelection}
            zoom={zoom}
            focusTime={mode === "cut" && selection ? (selection.start + selection.end) / 2 : playheadSource}
          />
        </div>

        {mode === "trim" ? (
          <>
            <p className="mt-1 text-xs text-dim">Drag the yellow handles to cut dead air off the start and end.</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Stepper label="Start" value={formatDuration(trimStart)} onMinus={() => nudgeTrim("start", -beat)} onPlus={() => nudgeTrim("start", beat)} />
              <Stepper label="End" value={formatDuration(trimEnd)} onMinus={() => nudgeTrim("end", -beat)} onPlus={() => nudgeTrim("end", beat)} />
            </div>
          </>
        ) : (
          selection && (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-xs text-dim">Drag the pink ends over the part you want gone (they snap to the beat). Drag the middle to move it. Preview plays the join before you commit.</p>
              <p className="text-sm font-semibold tabular-nums">
                Removing {formatDuration(selection.start)} – {formatDuration(selection.end)}{" "}
                <span className="text-dim">({(selection.end - selection.start).toFixed(1)} s)</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => { stopPreview(); setSelection(null); setMode("trim"); }}
                  className="min-h-12 rounded-xl border-2 border-line text-sm font-bold">Cancel</button>
                <button type="button" onClick={previewCut}
                  className="min-h-12 rounded-xl border-2 border-hot text-sm font-bold text-hot">{previewing ? "■ Stop" : "▶ Preview"}</button>
                <button type="button" onClick={removeSelection}
                  className="min-h-12 rounded-xl bg-hot text-sm font-black uppercase tracking-wide text-white active:scale-[0.98]">Remove</button>
              </div>
            </div>
          )
        )}

        {edits.cuts.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2" aria-label="Removed parts">
            {edits.cuts.map((c, i) => (
              <li key={`${c.start}-${i}`} className="flex items-center justify-between rounded-xl bg-ink px-4 py-2">
                <span className="text-sm font-semibold tabular-nums">
                  Removed {formatDuration(c.start)} – {formatDuration(c.end)}
                </span>
                <button type="button" onClick={() => change(removeCut(edits, i))} className="min-h-10 px-2 text-sm font-bold text-gold">
                  Put back
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {layerControls ? (
        <LayersSection
          layers={layers}
          controls={layerControls}
          getPlayer={() => playerRef.current}
          edits={edits}
          duration={duration}
          barSeconds={bar}
        />
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-line p-4 text-sm text-dim">
          🎙 After you save, you can add ad-lib layers on top from <b className="text-fg">Recordings → Edit</b>.
        </p>
      )}

      <section className="rounded-2xl border-2 border-line bg-panel p-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-dim">Mix</h3>
        <Slider label="Your voice" value={edits.mix.vocalGain} max={2} format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => change({ ...edits, mix: { ...edits.mix, vocalGain: v } })} />
        <Slider label="Beat" value={edits.mix.beatGain} max={1.5} format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => change({ ...edits, mix: { ...edits.mix, beatGain: v } })} />
      </section>

      <section className="rounded-2xl border-2 border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-widest text-dim">Effects</h3>
          <span className="text-xs font-semibold text-dim">{activePreset ? activePreset.label : "Custom"}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {EFFECT_PRESETS.map((preset) => {
            const active = activePreset?.id === preset.id;
            const locked = Boolean(preset.premium) && !isPremium;
            return (
              <button key={preset.id} type="button" aria-pressed={active}
                aria-label={locked ? `${preset.label} (Premium)` : undefined}
                onClick={() => {
                  if (locked) return setLockedNote(`“${preset.label}” is a Premium sound. Save your take, then go Premium from Settings → Upgrade to unlock it.`);
                  setLockedNote(null);
                  change({ ...edits, effects: { ...preset.effects } });
                }}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-1 text-center transition active:scale-95 ${active ? "border-gold bg-gold text-ink" : locked ? "border-line bg-ink opacity-60" : "border-line bg-ink"}`}>
                <span className="text-sm font-black leading-tight">{locked && "🔒 "}{preset.label}</span>
                <span className={`text-[11px] leading-tight ${active ? "text-ink/70" : "text-dim"}`}>{preset.hint}</span>
              </button>
            );
          })}
        </div>
        {lockedNote && <p role="status" className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold">{lockedNote}</p>}
        {!isPremium && edits.effects.tone !== "clean" && (
          <p className="mt-3 rounded-xl bg-gold/10 px-3 py-2 text-sm text-gold">This take uses a Premium voice tone. It will be saved with a clean voice unless you go Premium.</p>
        )}
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-dim">Fine-tune</p>
        <Slider label="Reverb" value={edits.effects.reverb} max={1} format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)}
          onChange={(v) => change({ ...edits, effects: { ...edits.effects, reverb: v } })} />
        <Slider label="Echo" value={edits.effects.echo} max={1} format={(v) => (v === 0 ? "Off" : `${Math.round(v * 100)}%`)}
          onChange={(v) => change({ ...edits, effects: { ...edits.effects, echo: v } })} />
      </section>

      {!isDefaultEdits(edits) && (
        <button type="button" onClick={() => change(DEFAULT_EDITS)}
          className="min-h-12 text-sm font-bold text-dim underline-offset-4 hover:text-fg hover:underline">
          Reset all edits <span className="font-normal">(you can undo this)</span>
        </button>
      )}
    </div>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const btn = "flex h-11 w-11 items-center justify-center rounded-xl border-2 border-line text-lg font-bold active:scale-95";
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-ink px-3 py-2">
      <span>
        <span className="block text-xs text-dim">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </span>
      <span className="flex gap-1">
        <button type="button" onClick={onMinus} aria-label={`${label} earlier by one beat`} className={btn}>−</button>
        <button type="button" onClick={onPlus} aria-label={`${label} later by one beat`} className={btn}>+</button>
      </span>
    </div>
  );
}

function Slider({ label, value, max, format, onChange }: { label: string; value: number; max: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="mt-3 block">
      <span className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-dim">{format(value)}</span>
      </span>
      <input type="range" min={0} max={max} step={0.01} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 h-10 w-full accent-gold" />
    </label>
  );
}
