"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeEdits, snapToBar, type RecordingEdits } from "@lib/editing/edits";

type Drag = { kind: "trimStart" } | { kind: "trimEnd" } | { kind: "cut"; index: number; edge: "start" | "end" };

/**
 * The editor's timeline, drawn on the beat timeline (un-edited). Dimmed = removed.
 * Drag the yellow handles to trim; drag a pink cut's edges (they snap to bar lines); tap to seek.
 */
export function EditorTimeline({
  peaks,
  duration,
  barSeconds,
  edits,
  playhead,
  onSeek,
  onChange,
}: {
  peaks: number[];
  /** Beat-timeline length of the un-edited mix. */
  duration: number;
  barSeconds: number;
  edits: RecordingEdits;
  /** Playhead on the beat timeline. */
  playhead: number;
  onSeek: (beatTime: number) => void;
  onChange: (edits: RecordingEdits) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);

  const trimStart = edits.trim?.start ?? 0;
  const trimEnd = edits.trim?.end ?? duration;
  const pct = (t: number) => `${(Math.min(duration, Math.max(0, t)) / duration) * 100}%`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || duration <= 0) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const g = canvas.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);
      g.clearRect(0, 0, w, h);
      const css = getComputedStyle(canvas);
      const color = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const gold = color("--color-gold", "#ffd60a");
      const dim = color("--color-dim", "#a1a1aa");
      const removed = color("--color-panel-2", "#22222a");
      const line = color("--color-line", "#33333d");

      // Bar grid: small ticks every bar, taller every 4 bars, so snapping is visible.
      const bars = Math.floor(duration / barSeconds);
      g.fillStyle = line;
      for (let b = 0; b <= bars; b++) {
        const x = (b * barSeconds / duration) * w;
        const tall = b % 4 === 0;
        g.fillRect(x, h - (tall ? 10 : 5), 1, tall ? 10 : 5);
      }

      const barW = 2;
      const gap = 1;
      const count = Math.max(1, Math.floor(w / (barW + gap)));
      const waveH = h - 14;
      for (let i = 0; i < count; i++) {
        const t = ((i + 0.5) / count) * duration;
        const peak = peaks.length ? peaks[Math.min(peaks.length - 1, Math.floor((i / count) * peaks.length))] : 0;
        const ph = Math.max(2, peak * (waveH - 4));
        const isRemoved = t < trimStart || t > trimEnd || edits.cuts.some((c) => t >= c.start && t < c.end);
        g.fillStyle = isRemoved ? removed : t <= playhead ? gold : dim;
        g.fillRect(i * (barW + gap), (waveH - ph) / 2, barW, ph);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, duration, barSeconds, trimStart, trimEnd, edits.cuts, playhead]);

  function timeAt(clientX: number): number {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  }

  function move(clientX: number, d: Drag) {
    const t = timeAt(clientX);
    if (d.kind === "trimStart") {
      onChange({ ...edits, trim: { start: Math.min(t, trimEnd - 1), end: trimEnd } });
    } else if (d.kind === "trimEnd") {
      onChange({ ...edits, trim: { start: trimStart, end: Math.max(t, trimStart + 1) } });
    } else {
      const cuts = edits.cuts.map((c, i) => {
        if (i !== d.index) return c;
        const snapped = snapToBar(t, barSeconds);
        return d.edge === "start"
          ? { start: Math.min(snapped, c.end - barSeconds), end: c.end }
          : { start: c.start, end: Math.max(snapped, c.start + barSeconds) };
      });
      onChange({ ...edits, cuts });
    }
  }

  function endDrag() {
    if (!drag) return;
    setDrag(null);
    onChange(normalizeEdits(edits, duration, barSeconds));
  }

  const handleProps = (d: Drag) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(d);
    },
    onPointerMove: (e: React.PointerEvent) => drag && move(e.clientX, drag),
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
  });

  return (
    <div
      ref={boxRef}
      className="relative h-32 touch-none select-none"
      onPointerDown={(e) => onSeek(timeAt(e.clientX))}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {edits.cuts.map((c, i) => (
        <div key={`${c.start}-${i}`} className="absolute top-0 bottom-3.5 border-x-2 border-hot bg-hot/20" style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})` }}>
          <div aria-label={`Drag start of cut ${i + 1}`} className="absolute -left-3 top-0 h-full w-6 cursor-ew-resize" {...handleProps({ kind: "cut", index: i, edge: "start" })} />
          <div aria-label={`Drag end of cut ${i + 1}`} className="absolute -right-3 top-0 h-full w-6 cursor-ew-resize" {...handleProps({ kind: "cut", index: i, edge: "end" })} />
        </div>
      ))}

      {/* Trim handles */}
      {(["trimStart", "trimEnd"] as const).map((kind) => (
        <div
          key={kind}
          role="slider"
          aria-label={kind === "trimStart" ? "Trim start" : "Trim end"}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(kind === "trimStart" ? trimStart : trimEnd)}
          className="absolute top-0 bottom-3.5 z-10 flex w-8 -translate-x-1/2 cursor-ew-resize justify-center"
          style={{ left: pct(kind === "trimStart" ? trimStart : trimEnd) }}
          {...handleProps({ kind })}
        >
          <span className="h-full w-1 rounded-full bg-gold" />
          <span className={`absolute top-1/2 h-8 w-4 -translate-y-1/2 rounded-md bg-gold ${kind === "trimStart" ? "left-4" : "right-4"}`} />
        </div>
      ))}

      <div className="pointer-events-none absolute top-0 bottom-3.5 w-0.5 bg-fg" style={{ left: pct(playhead) }} aria-hidden="true" />
    </div>
  );
}
