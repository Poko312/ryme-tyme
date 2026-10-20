"use client";

import type { RefObject } from "react";
import type { SessionPosition } from "@lib/timing/beatClock";
import type { PromptWord } from "@lib/words/types";

type Display = Pick<SessionPosition, "phase" | "countInBeat" | "bar" | "beatInBar" | "wordIndex">;

/** Font size that keeps a word on one line across the phone screen (Anton is ~0.5em per letter). */
function wordFontSize(word: string): string {
  const longest = Math.max(...word.split(" ").map((w) => w.length), 1);
  return `min(9rem, calc((100vw - 2.5rem) / ${(longest * 0.55).toFixed(2)}))`;
}

export function SessionStage({
  beatTitle,
  bpm,
  display,
  sequence,
  rhymeHints,
  totalBars,
  progressRef,
  paused,
  onPause,
  onResume,
  onStop,
}: {
  beatTitle: string;
  bpm: number;
  display: Display | null;
  sequence: PromptWord[];
  rhymeHints: boolean;
  totalBars: number;
  progressRef: RefObject<HTMLDivElement | null>;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const countingIn = !display || display.phase === "waiting" || display.phase === "countin";
  const wordIndex = display?.wordIndex ?? 0;
  const current = sequence[wordIndex];
  const next = countingIn ? sequence[0] : sequence[wordIndex + 1];
  const activeDot = countingIn ? Math.max(0, (display?.countInBeat ?? 1) - 1) : (display?.beatInBar ?? 0);

  return (
    // Full-screen overlay (covers the bottom nav so it can't be tapped mid-verse).
    <div className="fixed inset-0 z-50 flex flex-col bg-ink px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-safe">
      <header className="flex items-center justify-between gap-3 text-sm font-bold uppercase tracking-widest text-dim">
        <span className="truncate">{beatTitle} · {Math.round(bpm)} BPM</span>
        <span className={`shrink-0 tabular-nums ${paused ? "text-hot" : ""}`}>
          {paused ? "Paused" : countingIn ? "Count-in" : `Bar ${Math.min(totalBars, (display?.bar ?? 0) + 1)}/${totalBars}`}
        </span>
      </header>

      <main className={`flex flex-1 flex-col items-center justify-center text-center transition-opacity ${paused ? "opacity-30" : ""}`} aria-live="polite">
        {countingIn ? (
          <>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-hot">Get ready</p>
            <p className="font-display text-[10rem] leading-none tabular-nums text-fg">{display?.countInBeat || 1}</p>
          </>
        ) : (
          <>
            <p
              key={wordIndex}
              className="animate-[word-in_180ms_ease-out] font-display uppercase leading-[0.95] break-words text-gold"
              style={{ fontSize: current ? wordFontSize(current.word) : undefined }}
            >
              {current?.word}
            </p>
            {rhymeHints && current && current.rhymeHints.length > 0 && (
              <p className="mt-4 flex flex-wrap justify-center gap-2" aria-label="Rhymes">
                {current.rhymeHints.map((h) => (
                  <span key={h} className="rounded-full bg-panel-2 px-3 py-1 text-base font-semibold text-fg">{h}</span>
                ))}
              </p>
            )}
          </>
        )}

        {next && (
          <p className="mt-6 text-lg text-dim">
            {countingIn ? "first word" : "next"}: <span className="font-bold uppercase text-fg">{next.word}</span>
          </p>
        )}
      </main>

      <div className="flex flex-col gap-4 pb-2">
        {/* Visual metronome: one dot per beat of the bar. */}
        <div className="flex justify-center gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-4 w-4 rounded-full transition-colors duration-75 ${
                i === activeDot ? (countingIn ? "bg-hot" : i === 0 ? "bg-gold" : "bg-fg") : "bg-panel-2"
              }`}
            />
          ))}
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-panel-2" role="progressbar" aria-label="Time until the next word">
          <div ref={progressRef} className="h-full w-full origin-left rounded-full bg-hot" style={{ transform: "scaleX(0)" }} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {paused ? (
            <button type="button" onClick={onResume} className="min-h-16 rounded-2xl bg-gold font-display text-2xl uppercase text-ink active:scale-[0.98]">
              Resume
            </button>
          ) : (
            <button type="button" onClick={onPause} className="min-h-16 rounded-2xl border-2 border-line bg-panel font-display text-2xl uppercase active:scale-[0.98]">
              Pause
            </button>
          )}
          <button type="button" onClick={onStop} className="min-h-16 rounded-2xl bg-hot font-display text-2xl uppercase text-white active:scale-[0.98]">
            Stop
          </button>
        </div>
      </div>

    </div>
  );
}
