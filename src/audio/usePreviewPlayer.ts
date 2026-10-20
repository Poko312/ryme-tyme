"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PREVIEW_FADE_SECONDS, previewWindow, type BeatSummary } from "@lib/beats/library";

type PreviewBeat = Pick<BeatSummary, "id" | "durationSeconds" | "firstDownbeatSeconds">;

export interface PreviewState {
  playingId: string | null;
  loadingId: string | null;
  /** 0..1 through the preview */
  progress: number;
  error: string | null;
}

// One <audio> element shared app-wide, so only one preview ever plays at a time.
let sharedAudio: HTMLAudioElement | null = null;
function previewAudio(): HTMLAudioElement {
  sharedAudio ??= new Audio();
  return sharedAudio;
}

/**
 * Plays short beat previews with a single shared <audio> element. A media element (rather than
 * Web Audio) streams instantly without decoding the whole file, uses little memory on phones, and
 * plays even when an iPhone's silent switch is on. play() is called synchronously inside the
 * tap handler, which iOS requires.
 */
export function usePreviewPlayer() {
  const frameRef = useRef<number>(0);
  const [state, setState] = useState<PreviewState>({ playingId: null, loadingId: null, progress: 0, error: null });

  const stop = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    sharedAudio?.pause();
    if (sharedAudio) sharedAudio.volume = 1;
    setState((s) => ({ ...s, playingId: null, loadingId: null, progress: 0 }));
  }, []);

  const toggle = useCallback(
    (beat: PreviewBeat, url: string) => {
      if (state.playingId === beat.id || state.loadingId === beat.id) {
        stop();
        return;
      }
      cancelAnimationFrame(frameRef.current);

      const audio = previewAudio();
      const { offset, duration } = previewWindow(beat);
      const end = offset + duration;

      audio.pause();
      audio.preload = "auto";
      audio.volume = 1;
      // Media fragment: start at the first downbeat without waiting for metadata.
      audio.src = `${url}#t=${offset.toFixed(2)}`;

      setState({ playingId: null, loadingId: beat.id, progress: 0, error: null });

      const tick = () => {
        const t = audio.currentTime;
        if (t >= end || audio.ended) {
          stop();
          return;
        }
        // Fade out at the end. (iOS ignores .volume, so there it simply stops.)
        const remaining = end - t;
        audio.volume = remaining < PREVIEW_FADE_SECONDS ? Math.max(0, remaining / PREVIEW_FADE_SECONDS) : 1;
        setState((s) => ({ ...s, progress: Math.min(1, Math.max(0, (t - offset) / duration)) }));
        frameRef.current = requestAnimationFrame(tick);
      };

      audio.onplaying = () => {
        setState((s) => (s.loadingId === beat.id ? { ...s, playingId: beat.id, loadingId: null } : s));
        frameRef.current = requestAnimationFrame(tick);
      };
      audio.onerror = () => {
        cancelAnimationFrame(frameRef.current);
        setState({ playingId: null, loadingId: null, progress: 0, error: "Couldn't play that beat. Try again." });
      };

      audio.play().catch((err: unknown) => {
        // AbortError just means another preview started; ignore it.
        if (err instanceof DOMException && err.name === "AbortError") return;
        cancelAnimationFrame(frameRef.current);
        setState({ playingId: null, loadingId: null, progress: 0, error: "Tap play again to start the preview." });
      });
    },
    [state.playingId, state.loadingId, stop],
  );

  useEffect(() => {
    // Stop when leaving the page or when the app goes to the background.
    const onHide = () => {
      if (document.visibilityState === "hidden") stop();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      cancelAnimationFrame(frameRef.current);
      sharedAudio?.pause();
    };
  }, [stop]);

  return { ...state, toggle, stop };
}
