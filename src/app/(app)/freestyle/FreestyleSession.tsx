"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { displayLatencyFromRoundTrip } from "@lib/latency/calibration";
import { seededRng } from "@lib/random";
import { MAX_RECORDING_SECONDS, recordedWordSequence, vocalOffsetOnBeatTimeline } from "@lib/recording/sync";
import type { FreestyleSettings } from "@lib/session/settings";
import {
  audibleTime,
  beatStartTime,
  positionAt,
  totalBars,
  wordCount,
  type SessionPosition,
  type SessionTiming,
} from "@lib/timing/beatClock";
import { pickWordSequence } from "@lib/words/picker";
import type { PromptWord } from "@lib/words/types";
import { getAudioContext, setAudioSessionMode } from "@/audio/context";
import { estimatedOutputLatency, FreestyleEngine } from "@/audio/freestyleEngine";
import { useBeatBuffer } from "@/audio/useBeatBuffer";
import { useWakeLock } from "@/audio/useWakeLock";
import { buttonClass } from "@/components/ui";
import { defaultRoundTrip, getCalibratedRoundTrip } from "@/recording/latencyStore";
import { decodeRecording, findMarker, MarkerRecorder } from "@/recording/markerRecorder";
import { closeMicrophone, MIC_ERROR_MESSAGES, MicError, microphoneLabel, openMicrophone } from "@/recording/microphone";
import { FreestyleSettingsForm, settingsSummary } from "@/session/FreestyleSettingsForm";
import { useFreestyleSettings } from "@/session/useFreestyleSettings";
import { MicExplainer } from "./MicExplainer";
import { RecordingReview, type RecordingDraft } from "./RecordingReview";
import { SessionStage } from "./SessionStage";

export interface SessionBeat {
  id: string;
  title: string;
  producer: string;
  bpm: number;
  genre: string;
  firstDownbeatSeconds: number;
}

type Status = "ready" | "running" | "paused" | "processing" | "review" | "finished";

/** The parts of SessionPosition the screen shows; re-render only when one of these changes. */
type Display = Pick<SessionPosition, "phase" | "countInBeat" | "bar" | "beatInBar" | "wordIndex">;

function sameDisplay(a: Display | null, b: Display): boolean {
  return (
    a !== null &&
    a.phase === b.phase &&
    a.countInBeat === b.countInBeat &&
    a.bar === b.bar &&
    a.beatInBar === b.beatInBar &&
    a.wordIndex === b.wordIndex
  );
}

const BEATS_PER_BAR = 4;

interface ActiveRecording {
  recorder: MarkerRecorder;
  markerContextTime: number;
  roundTrip: number;
  calibrated: boolean;
}

export function FreestyleSession({
  beat,
  audioUrl,
  words,
  initialSettings,
}: {
  beat: SessionBeat;
  audioUrl: string | null;
  words: PromptWord[];
  initialSettings: FreestyleSettings;
}) {
  const beatAudio = useBeatBuffer(audioUrl);
  const { settings, update, saved } = useFreestyleSettings(initialSettings);
  const [status, setStatus] = useState<Status>("ready");
  const [showSettings, setShowSettings] = useState(false);
  const [sequence, setSequence] = useState<PromptWord[]>([]);
  const [display, setDisplay] = useState<Display | null>(null);
  const [barsInBeat, setBarsInBeat] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Recording
  const [recordOn, setRecordOn] = useState(false);
  const [micExplainer, setMicExplainer] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [draft, setDraft] = useState<RecordingDraft | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const micRef = useRef<MediaStream | null>(null);
  const recordingRef = useRef<ActiveRecording | null>(null);

  const engineRef = useRef<FreestyleEngine | null>(null);
  const timingRef = useRef<SessionTiming | null>(null);
  const sequenceRef = useRef<PromptWord[]>([]);
  const lastBarRef = useRef(-1);
  const latencyRef = useRef(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const finishingRef = useRef(false);

  useWakeLock(status === "running" || status === "paused");

  // Animation loop: read the audio clock every frame and show whatever is due.
  useEffect(() => {
    if (status !== "running") return;
    const ctx = getAudioContext();
    let frame = 0;
    const tick = () => {
      const timing = timingRef.current;
      if (!timing) return;
      const pos = positionAt(timing, audibleTime(ctx.currentTime, latencyRef.current));
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${pos.progressToNextWord})`;
      if (pos.phase === "playing") lastBarRef.current = pos.bar;
      const next: Display = {
        phase: pos.phase,
        countInBeat: pos.countInBeat,
        bar: pos.bar,
        beatInBar: pos.beatInBar,
        wordIndex: pos.wordIndex,
      };
      setDisplay((prev) => (sameDisplay(prev, next) ? prev : next));

      const rec = recordingRef.current;
      const tooLong = rec !== null && ctx.currentTime - rec.markerContextTime > MAX_RECORDING_SECONDS;
      if (pos.phase === "ended" || tooLong) {
        void finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // finish() only touches refs and state setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Going to the background: pause a practice session; end a recording (keeping the take).
  useEffect(() => {
    if (status !== "running") return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (recordingRef.current) {
        void finish();
      } else {
        void getAudioContext().suspend();
        setStatus("paused");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(
    () => () => {
      engineRef.current?.stop();
      recordingRef.current?.recorder.cancel();
      closeMicrophone(micRef.current);
      setAudioSessionMode("playback");
    },
    [],
  );

  // ---------------------------------------------------------------- microphone

  async function enableMic() {
    setMicBusy(true);
    setMicError(null);
    try {
      setAudioSessionMode("play-and-record");
      micRef.current = await openMicrophone();
      setRecordOn(true);
      setMicExplainer(false);
    } catch (err) {
      setAudioSessionMode("playback");
      setMicError(MIC_ERROR_MESSAGES[err instanceof MicError ? err.kind : "unknown"]);
    } finally {
      setMicBusy(false);
    }
  }

  function toggleRecord() {
    if (recordOn) {
      setRecordOn(false);
      closeMicrophone(micRef.current);
      micRef.current = null;
      setAudioSessionMode("playback");
    } else if (micRef.current) {
      setRecordOn(true);
    } else {
      setMicExplainer(true);
    }
  }

  // ---------------------------------------------------------------- session

  async function start() {
    if (beatAudio.status !== "ready") return;
    setError(null);
    const ctx = getAudioContext();
    // resume() must be *called* inside the tap for iPhone Safari; awaiting it afterwards is fine.
    const resuming = ctx.resume();
    try {
      await resuming;
    } catch {
      // handled below
    }
    if (ctx.state !== "running") {
      setError("Your phone blocked the sound. Tap Start again.");
      return;
    }

    const mic = recordOn ? micRef.current : null;
    const calibrated = getCalibratedRoundTrip(mic ? microphoneLabel(mic) : null);
    const roundTrip = calibrated ?? defaultRoundTrip(estimatedOutputLatency(ctx));

    // Start the recorder first so it is already capturing when the count-in begins.
    recordingRef.current = null;
    if (mic) {
      try {
        const recorder = new MarkerRecorder(ctx, mic);
        const { markerContextTime } = await recorder.start();
        recordingRef.current = { recorder, markerContextTime, roundTrip, calibrated: calibrated !== null };
      } catch (err) {
        console.error("[record] start failed", err);
        setError("Couldn't start recording. Try again, or turn Record off to practice.");
        return;
      }
    }

    engineRef.current ??= new FreestyleEngine(ctx, beatAudio.buffer, {
      bpm: beat.bpm,
      beatsPerBar: BEATS_PER_BAR,
      firstDownbeatSeconds: beat.firstDownbeatSeconds,
    });
    const timing = engineRef.current.plan(settings.wordEveryBars);
    const seq = pickWordSequence(words, settings, wordCount(timing), seededRng(Date.now() >>> 0));
    if (seq.length === 0) {
      recordingRef.current?.recorder.cancel();
      recordingRef.current = null;
      setError("No prompt words are available. Try again in a moment.");
      return;
    }

    timingRef.current = timing;
    sequenceRef.current = seq;
    lastBarRef.current = -1;
    finishingRef.current = false;
    // Show words when they're *heard*: calibrated users get their own headphone delay.
    latencyRef.current = calibrated !== null ? displayLatencyFromRoundTrip(calibrated) : estimatedOutputLatency(ctx);
    setSequence(seq);
    setBarsInBeat(totalBars(timing));
    setDisplay(null);
    setDraft(null);
    setIsRecording(recordingRef.current !== null);
    engineRef.current.start(timing, () => {});
    setShowSettings(false);
    setStatus("running");
  }

  /** Ends the session; if recording, turns the take into a draft for review. */
  async function finish() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    engineRef.current?.stop();
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) {
      void getAudioContext().resume(); // leave the context running for next time
      setStatus("finished");
      return;
    }

    setStatus("processing");
    try {
      const ctx = getAudioContext();
      const { blob, mimeType } = await rec.recorder.stop();
      const buffer = await decodeRecording(ctx, blob);
      const markerFileTime = findMarker(buffer);
      const timing = timingRef.current;
      if (markerFileTime === null || !timing) throw new Error("sync marker not found");

      const vocalOffset = vocalOffsetOnBeatTimeline({
        markerContextTime: rec.markerContextTime,
        markerFileTime,
        beatStartContextTime: beatStartTime(timing),
        roundTripLatency: rec.roundTrip,
      });
      const recordedWords = recordedWordSequence(sequenceRef.current, timing, lastBarRef.current);
      if (lastBarRef.current < 0 || recordedWords.length === 0) {
        setError("That take ended during the count-in, so there's nothing to save. Try again!");
        setStatus("ready");
        return;
      }
      setDraft({
        blob,
        mimeType,
        buffer,
        vocalOffset,
        latency: rec.roundTrip,
        calibrated: rec.calibrated,
        words: recordedWords,
        settings,
      });
      setStatus("review");
    } catch (err) {
      console.error("[record] processing failed", err);
      setError("Something went wrong processing your take. Please try again.");
      setStatus("ready");
    }
  }

  function pause() {
    void getAudioContext().suspend();
    setStatus("paused");
  }

  async function resume() {
    // Everything is scheduled on the audio clock, which freezes while suspended,
    // so beat and words pick up exactly where they left off.
    await getAudioContext().resume();
    setStatus("running");
  }

  // ---------------------------------------------------------------- screens

  if (status === "running" || status === "paused") {
    return (
      <SessionStage
        beatTitle={beat.title}
        bpm={beat.bpm}
        display={display}
        sequence={sequence}
        rhymeHints={settings.rhymeHints}
        totalBars={barsInBeat}
        progressRef={progressRef}
        paused={status === "paused"}
        recording={isRecording}
        onPause={pause}
        onResume={resume}
        onStop={() => void finish()}
      />
    );
  }

  if (status === "processing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <p className="font-display text-4xl uppercase">Processing take…</p>
        <p className="text-dim">Lining your vocals up with the beat.</p>
      </div>
    );
  }

  if (status === "review" && draft && beatAudio.status === "ready") {
    return (
      <RecordingReview
        draft={draft}
        beat={{ id: beat.id, title: beat.title, bpm: beat.bpm, firstDownbeatSeconds: beat.firstDownbeatSeconds }}
        beatBuffer={beatAudio.buffer}
        onDiscard={() => {
          setDraft(null);
          setStatus("ready");
        }}
      />
    );
  }

  const barsDone = display ? Math.max(0, Math.min(barsInBeat, display.phase === "ended" ? barsInBeat : display.bar)) : 0;
  const wordsDone = display && display.phase !== "countin" ? display.wordIndex + 1 : 0;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-5xl uppercase leading-none">Freestyle</h1>

      {status === "finished" && (
        <section className="rounded-2xl border-2 border-gold bg-panel p-5">
          <p className="font-display text-4xl uppercase text-gold">
            {display?.phase === "ended" ? "Beat finished!" : "Session over"}
          </p>
          <p className="mt-1 text-lg">
            {wordsDone} {wordsDone === 1 ? "word" : "words"} · {barsDone} bars
          </p>
        </section>
      )}

      <section className="flex items-center gap-4 rounded-2xl border-2 border-line bg-panel p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-dim">Beat</p>
          <p className="line-clamp-2 text-xl font-bold leading-tight">{beat.title}</p>
          <p className="text-sm capitalize text-dim">
            {Math.round(beat.bpm)} BPM · {beat.genre}
          </p>
        </div>
        <Link href="/beats" className="flex min-h-12 shrink-0 items-center rounded-xl border-2 border-line px-4 text-sm font-bold hover:border-gold">
          Change
        </Link>
      </section>

      <section className="rounded-2xl border-2 border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-bold uppercase tracking-widest text-dim">Settings</p>
          <span className="text-xs text-dim" aria-live="polite">{saved ? "" : "Saving…"}</span>
        </div>
        {showSettings ? (
          <div className="mt-4">
            <FreestyleSettingsForm settings={settings} onChange={update} />
            <button type="button" onClick={() => setShowSettings(false)} className={buttonClass("secondary", "mt-5 w-full")}>
              Done
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowSettings(true)} className="mt-2 flex w-full flex-wrap gap-2 text-left" aria-label="Change settings">
            {settingsSummary(settings).map((s) => (
              <span key={s} className="rounded-full bg-panel-2 px-3 py-1.5 text-sm font-semibold capitalize">{s}</span>
            ))}
            <span className="rounded-full px-3 py-1.5 text-sm font-bold text-gold">Edit</span>
          </button>
        )}
      </section>

      <label className={`flex min-h-16 cursor-pointer items-center justify-between gap-4 rounded-2xl border-2 px-4 ${recordOn ? "border-hot bg-hot/10" : "border-line bg-panel"}`}>
        <span className="flex items-center gap-3">
          <span className={`h-4 w-4 rounded-full ${recordOn ? "bg-hot" : "bg-panel-2"}`} aria-hidden="true" />
          <span>
            <span className="block font-bold">Record</span>
            <span className="block text-xs text-dim">{recordOn ? "Your voice will be recorded. Wear headphones!" : "Practice only — nothing recorded"}</span>
          </span>
        </span>
        <input type="checkbox" role="switch" checked={recordOn} onChange={toggleRecord} className="h-7 w-7 shrink-0 accent-hot" />
      </label>

      {!recordOn && <p className="text-sm text-dim">Tip: wear headphones so you can hear the beat clearly.</p>}

      {(error || beatAudio.status === "error") && (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">
          {error ?? (beatAudio.status === "error" ? beatAudio.message : "")}
        </p>
      )}

      {/* Big start button sits low on the screen for one-handed use. */}
      <div className="sticky bottom-20 z-10 -mx-5 bg-linear-to-t from-ink from-75% to-transparent px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={start}
          disabled={beatAudio.status !== "ready"}
          className={buttonClass(recordOn ? "record" : "primary", "min-h-20 w-full font-display text-3xl uppercase tracking-wide shadow-xl shadow-ink")}
        >
          {beatAudio.status === "loading" ? "Loading beat…" : recordOn ? "Start recording" : status === "finished" ? "Go again" : "Start"}
        </button>
      </div>

      {micExplainer && (
        <MicExplainer onAllow={enableMic} onCancel={() => setMicExplainer(false)} busy={micBusy} error={micError} />
      )}
    </div>
  );
}
