"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RecordingEdits } from "@lib/editing/edits";
import { layerOffsetOnBeatTimeline } from "@lib/recording/sync";
import { formatDuration } from "@lib/beats/library";
import { getAudioContext, setAudioSessionMode } from "@/audio/context";
import { estimatedOutputLatency } from "@/audio/freestyleEngine";
import type { MixPlayer, PlayerLayer } from "@/audio/mixPlayer";
import { defaultRoundTrip, getCalibratedRoundTrip } from "@/recording/latencyStore";
import { decodeRecording, findMarker, MarkerRecorder } from "@/recording/markerRecorder";
import { MicExplainer } from "@/recording/MicExplainer";
import { closeMicrophone, MIC_ERROR_MESSAGES, MicError, microphoneLabel, openMicrophone } from "@/recording/microphone";

export interface EditorLayer extends PlayerLayer {
  label: string;
}

export interface LayerTake {
  blob: Blob;
  mimeType: string;
  buffer: AudioBuffer;
  offset: number;
  latency: number;
}

export interface LayerControls {
  /** How many layers this recording may have (by plan). */
  limit: number;
  /** Upload + save a new layer; resolve to an error message, or null on success. */
  onRecorded: (take: LayerTake) => Promise<string | null>;
  onUpdate: (id: string, patch: Partial<Pick<EditorLayer, "label" | "gain" | "muted">>) => void;
  onDelete: (id: string) => void;
}

type Phase = "idle" | "recording" | "processing";

/**
 * Overdubs: record ad-libs or doubles on top of the take while the mix plays in your headphones.
 * While recording, the mix plays *un-cut* so audio-clock time maps straight onto the beat timeline.
 */
export function LayersSection({
  layers,
  controls,
  getPlayer,
  edits,
  duration,
  barSeconds,
}: {
  layers: EditorLayer[];
  controls: LayerControls;
  getPlayer: () => MixPlayer | null;
  edits: RecordingEdits;
  duration: number;
  barSeconds: number;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [explainer, setExplainer] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const micRef = useRef<MediaStream | null>(null);
  const takeRef = useRef<{
    recorder: MarkerRecorder;
    markerContextTime: number;
    anchor: { contextTime: number; position: number };
    roundTrip: number;
    restore: RecordingEdits;
    /** Edited-timeline position before recording, to return to afterwards. */
    returnTo: number;
  } | null>(null);

  useEffect(
    () => () => {
      takeRef.current?.recorder.cancel();
      closeMicrophone(micRef.current);
      setAudioSessionMode("playback");
    },
    [],
  );

  // While recording: show elapsed time and finish automatically when playback reaches the end.
  useEffect(() => {
    if (phase !== "recording") return;
    let frame = 0;
    const tick = () => {
      const player = getPlayer();
      const take = takeRef.current;
      if (!player || !take) return;
      setElapsed(getAudioContext().currentTime - take.anchor.contextTime);
      if (!player.isPlaying) {
        void finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function allowMic() {
    setMicBusy(true);
    setMicError(null);
    try {
      setAudioSessionMode("play-and-record");
      micRef.current = await openMicrophone();
      setExplainer(false);
      void start(); // they just tapped "Allow" to record — go straight in
    } catch (err) {
      setAudioSessionMode("playback");
      setMicError(MIC_ERROR_MESSAGES[err instanceof MicError ? err.kind : "unknown"]);
    } finally {
      setMicBusy(false);
    }
  }

  async function start() {
    setError(null);
    const mic = micRef.current;
    if (!mic) return setExplainer(true);
    const player = getPlayer();
    if (!player) return;
    const ctx = getAudioContext();
    const resuming = ctx.resume(); // inside the tap (iPhone)
    player.pause();
    const returnTo = player.position;
    await resuming;

    const calibrated = getCalibratedRoundTrip(microphoneLabel(mic));
    const roundTrip = calibrated ?? defaultRoundTrip(estimatedOutputLatency(ctx));
    try {
      const recorder = new MarkerRecorder(ctx, mic);
      const { markerContextTime } = await recorder.start();
      // Play the take un-cut, from one bar before the kept part, to the end of the kept part.
      const restore = edits;
      player.setEdits({ ...edits, trim: null, cuts: [] });
      const from = Math.max(0, (edits.trim?.start ?? 0) - barSeconds);
      player.play(from, edits.trim?.end ?? duration);
      takeRef.current = { recorder, markerContextTime, anchor: player.anchor, roundTrip, restore, returnTo };
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      console.error("[layers] start failed", err);
      setError("Couldn't start recording. Try again.");
    }
  }

  async function finish() {
    const take = takeRef.current;
    const player = getPlayer();
    if (!take || !player) return;
    takeRef.current = null;
    player.pause();
    player.setEdits(take.restore);
    player.seek(take.returnTo);
    setPhase("processing");
    try {
      const ctx = getAudioContext();
      const { blob, mimeType } = await take.recorder.stop();
      const buffer = await decodeRecording(ctx, blob);
      const markerFileTime = findMarker(buffer);
      if (markerFileTime === null) throw new Error("sync marker not found");
      const offset = layerOffsetOnBeatTimeline({
        markerContextTime: take.markerContextTime,
        markerFileTime,
        playbackStartContextTime: take.anchor.contextTime,
        playbackStartPosition: take.anchor.position,
        roundTripLatency: take.roundTrip,
      });
      const message = await controls.onRecorded({ blob, mimeType, buffer, offset, latency: take.roundTrip });
      if (message) setError(message);
    } catch (err) {
      console.error("[layers] processing failed", err);
      setError("Something went wrong with that layer. Please try again.");
    } finally {
      setPhase("idle");
    }
  }

  const full = layers.length >= controls.limit;

  return (
    <section className="rounded-2xl border-2 border-line bg-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-dim">Layers</h3>
        <span className="text-xs font-semibold text-dim">{layers.length} of {controls.limit}</span>
      </div>
      <p className="mt-1 text-xs text-dim">Add ad-libs, hype words or a double on top of your take. Wear headphones.</p>

      {layers.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3">
          {layers.map((layer) => (
            <li key={layer.id} className="rounded-xl bg-ink p-3">
              <div className="flex items-center gap-2">
                <input
                  defaultValue={layer.label}
                  maxLength={40}
                  aria-label="Layer name"
                  onBlur={(e) => e.target.value.trim() && e.target.value !== layer.label && controls.onUpdate(layer.id, { label: e.target.value.trim() })}
                  className="min-h-10 min-w-0 flex-1 rounded-lg bg-transparent px-2 font-semibold focus:bg-panel focus:outline-none"
                />
                <button type="button" aria-pressed={layer.muted} onClick={() => controls.onUpdate(layer.id, { muted: !layer.muted })}
                  className={`min-h-10 rounded-lg px-3 text-sm font-bold ${layer.muted ? "bg-panel-2 text-dim" : "border-2 border-line"}`}>
                  {layer.muted ? "Muted" : "Mute"}
                </button>
                <button type="button" onClick={() => controls.onDelete(layer.id)} className="min-h-10 px-2 text-sm font-bold text-danger">Delete</button>
              </div>
              <label className="mt-1 flex items-center gap-3 px-2 text-sm">
                <span className="w-12 tabular-nums text-dim">{Math.round(layer.gain * 100)}%</span>
                <input type="range" min={0} max={2} step={0.01} value={layer.gain} aria-label={`${layer.label} volume`}
                  onChange={(e) => controls.onUpdate(layer.id, { gain: Number(e.target.value) })} className="h-9 flex-1 accent-gold" />
              </label>
            </li>
          ))}
        </ul>
      )}

      {phase === "recording" ? (
        <button type="button" onClick={() => void finish()}
          className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-hot font-display text-xl uppercase text-white">
          <span className="h-3 w-3 animate-pulse rounded-full bg-white" aria-hidden="true" /> Stop layer · {formatDuration(Math.max(0, elapsed))}
        </button>
      ) : full ? (
        <p className="mt-3 rounded-xl border-2 border-dashed border-line p-3 text-sm text-dim">
          {controls.limit === 1 ? (
            <>Free accounts get 1 layer per recording. <Link href="/upgrade" className="font-semibold text-gold underline">Go Premium</Link> for up to 4 (save your edits first).</>
          ) : (
            <>That&apos;s the maximum of {controls.limit} layers. Delete one to record another.</>
          )}
        </p>
      ) : (
        <button type="button" onClick={start} disabled={phase === "processing"}
          className="mt-3 min-h-14 w-full rounded-xl border-2 border-hot text-base font-bold text-hot disabled:opacity-50">
          {phase === "processing" ? "Adding layer…" : "🎙 Record a layer"}
        </button>
      )}
      {phase === "recording" && <p className="mt-2 text-xs text-dim">The take plays from just before your start point. Stop whenever you&apos;re done.</p>}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-danger">{error}</p>}

      {explainer && <MicExplainer onAllow={allowMic} onCancel={() => setExplainer(false)} busy={micBusy} error={micError} />}
    </section>
  );
}
