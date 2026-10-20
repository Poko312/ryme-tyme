"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { calibrationClickTimes, detectOnsets, estimateRoundTrip } from "@lib/latency/calibration";
import { scheduleClick } from "@/audio/click";
import { getAudioContext, setAudioSessionMode } from "@/audio/context";
import { buttonClass } from "@/components/ui";
import { saveCalibratedRoundTrip } from "@/recording/latencyStore";
import { decodeRecording, findMarker, MarkerRecorder } from "@/recording/markerRecorder";
import { closeMicrophone, MIC_ERROR_MESSAGES, MicError, microphoneLabel, openMicrophone } from "@/recording/microphone";

const LEAD_CLICKS = 4;
const CLAP_CLICKS = 8;
const INTERVAL = 0.75; // 80 BPM: slow enough that even Bluetooth delays can't be confused with the next click

type Phase = "intro" | "running" | "analyzing" | "done" | "failed";

/** Resolves when the audio clock passes `t` (polled each frame). */
function waitForContextTime(ctx: AudioContext, t: number): Promise<void> {
  return new Promise((resolve) => {
    const check = () => (ctx.currentTime >= t ? resolve() : requestAnimationFrame(check));
    check();
  });
}

export function CalibrationFlow() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [clickIndex, setClickIndex] = useState(-1);
  const [result, setResult] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const clicksRef = useRef<OscillatorNode[]>([]);

  useEffect(
    () => () => {
      clicksRef.current.forEach((c) => c.disconnect());
      closeMicrophone(micRef.current);
      setAudioSessionMode("playback");
    },
    [],
  );

  async function run() {
    setMessage(null);
    const ctx = getAudioContext();
    const resuming = ctx.resume(); // inside the tap (iPhone)
    let mic: MediaStream;
    try {
      setAudioSessionMode("play-and-record");
      mic = await openMicrophone();
      micRef.current = mic;
      await resuming;
    } catch (err) {
      setAudioSessionMode("playback");
      setMessage(MIC_ERROR_MESSAGES[err instanceof MicError ? err.kind : "unknown"]);
      setPhase("failed");
      return;
    }

    try {
      const recorder = new MarkerRecorder(ctx, mic);
      const { markerContextTime } = await recorder.start();
      const first = ctx.currentTime + 0.6;
      const all = calibrationClickTimes(first, LEAD_CLICKS + CLAP_CLICKS, INTERVAL);
      clicksRef.current = all.map((t, i) => scheduleClick(ctx, t, i >= LEAD_CLICKS));
      setPhase("running");

      // Light up a dot per click, driven by the audio clock.
      let frame = 0;
      const tick = () => {
        setClickIndex(Math.floor((ctx.currentTime - first) / INTERVAL));
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      await waitForContextTime(ctx, all[all.length - 1] + 1);
      cancelAnimationFrame(frame);

      setPhase("analyzing");
      const { blob } = await recorder.stop();
      const label = microphoneLabel(mic);
      closeMicrophone(mic);
      micRef.current = null;
      setAudioSessionMode("playback");

      const buffer = await decodeRecording(ctx, blob);
      const markerFile = findMarker(buffer);
      if (markerFile === null) throw new Error("marker not found");
      // Skip the marker itself, then convert clap times from file time to the audio clock.
      const skip = markerFile + 0.05;
      const samples = buffer.getChannelData(0).subarray(Math.round(skip * buffer.sampleRate));
      const onsets = detectOnsets(samples, buffer.sampleRate).map((t) => markerContextTime + (t + skip - markerFile));
      const estimate = estimateRoundTrip(all.slice(LEAD_CLICKS), onsets);

      if (!estimate.ok || estimate.roundTrip === null) {
        setMessage(
          estimate.matched < 5
            ? "We couldn't hear enough claps. Clap louder and closer to the mic — on every click after the first four."
            : "Your claps were a bit uneven. Try again and keep a steady rhythm.",
        );
        setPhase("failed");
        return;
      }
      saveCalibratedRoundTrip(label, estimate.roundTrip);
      setResult(estimate.roundTrip);
      setPhase("done");
    } catch (err) {
      console.error("[calibrate] failed", err);
      closeMicrophone(micRef.current);
      micRef.current = null;
      setAudioSessionMode("playback");
      setMessage("Something went wrong. Please try again.");
      setPhase("failed");
    }
  }

  if (phase === "running" || phase === "analyzing") {
    const clapping = clickIndex >= LEAD_CLICKS;
    return (
      <div className="flex flex-col items-center gap-8 py-10 text-center">
        <p className="font-display text-6xl uppercase leading-none">
          {phase === "analyzing" ? "Checking…" : clapping ? <span className="text-hot">Clap!</span> : "Listen…"}
        </p>
        <div className="flex flex-wrap justify-center gap-2" aria-hidden="true">
          {Array.from({ length: LEAD_CLICKS + CLAP_CLICKS }, (_, i) => (
            <span key={i} className={`h-5 w-5 rounded-full ${i === clickIndex ? (i >= LEAD_CLICKS ? "bg-hot" : "bg-fg") : i < clickIndex ? "bg-panel-2" : i >= LEAD_CLICKS ? "border-2 border-hot" : "border-2 border-line"}`} />
          ))}
        </div>
        <p className="text-dim">First 4 clicks: just listen. Then clap on each click.</p>
      </div>
    );
  }

  if (phase === "done" && result !== null) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-2xl border-2 border-gold bg-panel p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-dim">Your headphone delay</p>
          <p className="font-display text-6xl text-gold">{Math.round(result * 1000)} ms</p>
          <p className="mt-2 text-dim">
            Saved for these headphones on this device. Your recordings and prompt words will be lined up using it.
            {result > 0.15 && " That's typical for Bluetooth — wired headphones feel tighter."}
          </p>
        </div>
        <Link href="/freestyle" className={buttonClass("primary", "min-h-14 w-full text-lg")}>Start freestyling</Link>
        <button type="button" onClick={run} className={buttonClass("secondary", "w-full")}>Test again</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg">
        Headphones — especially Bluetooth ones like AirPods — add a delay. A 20-second test measures it so your vocals land right on the beat.
      </p>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-dim">
        <li>Put on the headphones you rap with.</li>
        <li>You&apos;ll hear 4 clicks to get the tempo, then 8 more.</li>
        <li><b className="text-fg">Clap</b> (or say “ta”) right on each of the 8 clicks, near your phone&apos;s mic.</li>
      </ol>
      <p className="text-sm text-dim">Redo this whenever you switch headphones.</p>
      {phase === "failed" && message && (
        <p role="alert" className="rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">{message}</p>
      )}
      <button type="button" onClick={run} className={buttonClass("primary", "min-h-16 w-full font-display text-2xl uppercase")}>
        {phase === "failed" ? "Try again" : "Start test"}
      </button>
    </div>
  );
}
