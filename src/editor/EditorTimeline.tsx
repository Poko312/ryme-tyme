"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeEdits, snapToGrid, type RecordingEdits, type TimeRange } from "@lib/editing/edits";

export type EditorMode = "trim" | "cut";

type Drag =
  | { kind: "trimStart" }
  | { kind: "trimEnd" }
  | { kind: "selStart" }
  | { kind: "selEnd" }
  | { kind: "selMove"; grabOffset: number };

/**
 * The editor's timeline, drawn on the beat timeline (un-edited). Dimmed = removed.
 * Trim mode: drag the yellow handles. Cut mode: drag the pink selection's ends (snapped to beats)
 * or its middle to move it. Tapping empty space seeks.
 */
export function EditorTimeline({
  peaks,
  duration,
  gridSeconds,
  barSeconds,
  edits,
  playhead,
  mode,
  selection,
  onSeek,
  onChange,
  onSelectionChange,
}: {
  peaks: number[];
  /** Beat-timeline length of the un-edited mix. */
  duration: number;
  /** Cut snapping grid (one beat). */
  gridSeconds: number;
  barSeconds: number;
  edits: RecordingEdits;
  /** Playhead on the beat timeline. */
  playhead: number;
  mode: EditorMode;
  selection: TimeRange | null;
  onSeek: (beatTime: number) => void;
  onChange: (edits: RecordingEdits) => void;
  onSelectionChange: (range: TimeRange) => void;
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

      // Bar grid: small ticks every bar, taller every 4 bars.
      const bars = Math.floor(duration / barSeconds);
      g.fillStyle = line;
      for (let b = 0; b <= bars; b++) {
        const x = ((b * barSeconds) / duration) * w;
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
    } else if (selection) {
      const snap = (x: number) => Math.min(trimEnd, Math.max(trimStart, snapToGrid(x, gridSeconds)));
      if (d.kind === "selStart") {
        onSelectionChange({ start: Math.min(snap(t), selection.end - gridSeconds), end: selection.end });
      } else if (d.kind === "selEnd") {
        onSelectionChange({ start: selection.start, end: Math.max(snap(t), selection.start + gridSeconds) });
      } else {
        const length = selection.end - selection.start;
        const start = Math.min(Math.max(trimStart, snapToGrid(t - d.grabOffset, gridSeconds)), trimEnd - length);
        onSelectionChange({ start, end: start + length });
      }
    }
  }

  function endDrag() {
    if (!drag) return;
    const wasTrim = drag.kind === "trimStart" || drag.kind === "trimEnd";
    setDrag(null);
    if (wasTrim) onChange(normalizeEdits(edits, duration, gridSeconds));
  }

  // Every draggable element says what it is in data-drag; one set of handlers serves them all.
  function onDragStart(e: React.PointerEvent<HTMLElement>) {
    const kind = e.currentTarget.dataset.drag as Drag["kind"] | undefined;
    if (!kind) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(kind === "selMove" ? { kind, grabOffset: timeAt(e.clientX) - (selection?.start ?? 0) } : { kind });
  }

  function onDragMove(e: React.PointerEvent<HTMLElement>) {
    if (drag) move(e.clientX, drag);
  }

  const dragHandlers = { onPointerDown: onDragStart, onPointerMove: onDragMove, onPointerUp: endDrag, onPointerCancel: endDrag };

  return (
    <div ref={boxRef} className="relative h-32 touch-none select-none" onPointerDown={(e) => onSeek(timeAt(e.clientX))}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />

      {/* Cuts already made: striped, fixed (undo them from the list below). */}
      {edits.cuts.map((c, i) => (
        <div
          key={`${c.start}-${i}`}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 bottom-3.5 bg-[repeating-linear-gradient(135deg,rgba(255,46,136,0.28)_0_6px,transparent_6px_12px)]"
          style={{ left: pct(c.start), width: `calc(${pct(c.end)} - ${pct(c.start)})` }}
        />
      ))}

      {mode === "trim" &&
        (["trimStart", "trimEnd"] as const).map((kind) => (
          <div
            key={kind}
            role="slider"
            aria-label={kind === "trimStart" ? "Trim start" : "Trim end"}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(kind === "trimStart" ? trimStart : trimEnd)}
            className="absolute top-0 bottom-3.5 z-10 flex w-10 -translate-x-1/2 cursor-ew-resize justify-center"
            style={{ left: pct(kind === "trimStart" ? trimStart : trimEnd) }}
            data-drag={kind}
            {...dragHandlers}
          >
            <span className="h-full w-1 rounded-full bg-gold" />
            <span className={`absolute top-1/2 h-9 w-4 -translate-y-1/2 rounded-md bg-gold ${kind === "trimStart" ? "left-5" : "right-5"}`} />
          </div>
        ))}

      {mode === "cut" && selection && (
        <div
          className="absolute top-0 bottom-3.5 z-10 cursor-grab border-y-2 border-hot bg-hot/30 active:cursor-grabbing"
          style={{ left: pct(selection.start), width: `calc(${pct(selection.end)} - ${pct(selection.start)})` }}
          aria-label="Selection to remove — drag to move"
          data-drag="selMove"
          {...dragHandlers}
        >
          {(["selStart", "selEnd"] as const).map((kind) => (
            <div
              key={kind}
              role="slider"
              aria-label={kind === "selStart" ? "Start of part to remove" : "End of part to remove"}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(kind === "selStart" ? selection.start : selection.end)}
              className={`absolute top-0 z-20 flex h-full w-10 cursor-ew-resize justify-center ${kind === "selStart" ? "-left-5" : "-right-5"}`}
              data-drag={kind}
              {...dragHandlers}
            >
              <span className="h-full w-1 rounded-full bg-hot" />
              <span className="absolute top-1/2 h-9 w-4 -translate-y-1/2 rounded-md bg-hot" />
            </div>
          ))}
        </div>
      )}

      <div className="pointer-events-none absolute top-0 bottom-3.5 z-0 w-0.5 bg-fg" style={{ left: pct(playhead) }} aria-hidden="true" />
    </div>
  );
}
