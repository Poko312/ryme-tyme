"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { seededRng } from "@lib/random";
import type { FreestyleSettings } from "@lib/session/settings";
import {
  audibleTime,
  positionAt,
  totalBars,
  wordCount,
  type SessionPosition,
  type SessionTiming,
} from "@lib/timing/beatClock";
import { pickWordSequence } from "@lib/words/picker";
import type { PromptWord } from "@lib/words/types";
import { getAudioContext } from "@/audio/context";
import { estimatedOutputLatency, FreestyleEngine } from "@/audio/freestyleEngine";
import { useBeatBuffer } from "@/audio/useBeatBuffer";
import { useWakeLock } from "@/audio/useWakeLock";
import { buttonClass } from "@/components/ui";
import { FreestyleSettingsForm, settingsSummary } from "@/session/FreestyleSettingsForm";
import { useFreestyleSettings } from "@/session/useFreestyleSettings";
import { SessionStage } from "./SessionStage";

export interface SessionBeat {
  id: string;
  title: string;
  producer: string;
  bpm: number;
  genre: string;
  firstDownbeatSeconds: number;
}

type Status = "ready" | "running" | "paused" | "finished";

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

  const engineRef = useRef<FreestyleEngine | null>(null);
  const timingRef = useRef<SessionTiming | null>(null);
  const latencyRef = useRef(0);
  const progressRef = useRef<HTMLDivElement>(null);

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
      // Progress bar updates every frame without re-rendering React.
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${pos.progressToNextWord})`;
      const next: Display = {
        phase: pos.phase,
        countInBeat: pos.countInBeat,
        bar: pos.bar,
        beatInBar: pos.beatInBar,
        wordIndex: pos.wordIndex,
      };
      setDisplay((prev) => (sameDisplay(prev, next) ? prev : next));
      if (pos.phase === "ended") {
        engineRef.current?.stop();
        setStatus("finished");
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [status]);

  // Pause automatically if the app goes to the background (the phone suspends audio anyway).
  useEffect(() => {
    if (status !== "running") return;
    const onHide = () => {
      if (document.visibilityState === "hidden") {
        void getAudioContext().suspend();
        setStatus("paused");
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [status]);

  useEffect(() => () => engineRef.current?.stop(), []);

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

    engineRef.current ??= new FreestyleEngine(ctx, beatAudio.buffer, {
      bpm: beat.bpm,
      beatsPerBar: BEATS_PER_BAR,
      firstDownbeatSeconds: beat.firstDownbeatSeconds,
    });
    const timing = engineRef.current.plan(settings.wordEveryBars);
    const seq = pickWordSequence(words, settings, wordCount(timing), seededRng(Date.now() >>> 0));
    if (seq.length === 0) {
      setError("No prompt words are available. Try again in a moment.");
      return;
    }

    timingRef.current = timing;
    latencyRef.current = estimatedOutputLatency(ctx);
    setSequence(seq);
    setBarsInBeat(totalBars(timing));
    setDisplay(null);
    engineRef.current.start(timing, () => {});
    setShowSettings(false);
    setStatus("running");
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

  function stop() {
    engineRef.current?.stop();
    void getAudioContext().resume(); // leave the context running for next time
    setStatus("finished");
  }

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
        onPause={pause}
        onResume={resume}
        onStop={stop}
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

      <p className="text-sm text-dim">Tip: wear headphones so you can hear the beat clearly.</p>

      {(error || beatAudio.status === "error") && (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">
          {error ?? (beatAudio.status === "error" ? beatAudio.message : "")}
        </p>
      )}

      {/* Big start button sits low on the screen for one-handed use. */}
      <div className="sticky bottom-24 z-10 pt-2">
        <button
          type="button"
          onClick={start}
          disabled={beatAudio.status !== "ready"}
          className={buttonClass("primary", "min-h-20 w-full font-display text-3xl uppercase tracking-wide shadow-xl shadow-ink")}
        >
          {beatAudio.status === "loading" ? "Loading beat…" : status === "finished" ? "Go again" : "Start"}
        </button>
      </div>
    </div>
  );
}
