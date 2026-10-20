"use client";

import { useEffect, useRef } from "react";

/** Bar-style waveform with a played/unplayed split. Tap or drag to seek. */
export function Waveform({
  peaks,
  progress,
  onSeek,
  label = "Recording waveform",
  height = 96,
}: {
  peaks: number[];
  progress: number;
  onSeek?: (fraction: number) => void;
  label?: string;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const g = canvas.getContext("2d");
      if (!g) return;
      g.scale(dpr, dpr);
      g.clearRect(0, 0, width, height);
      const barWidth = 3;
      const gap = 2;
      const count = Math.max(1, Math.floor(width / (barWidth + gap)));
      const styles = getComputedStyle(canvas);
      const played = styles.getPropertyValue("--color-gold").trim() || "#ffd60a";
      const unplayed = styles.getPropertyValue("--color-line").trim() || "#33333d";
      for (let i = 0; i < count; i++) {
        const peak = peaks.length ? peaks[Math.floor((i / count) * peaks.length)] : 0;
        const h = Math.max(2, peak * (height - 4));
        g.fillStyle = i / count < progress ? played : unplayed;
        g.fillRect(i * (barWidth + gap), (height - h) / 2, barWidth, h);
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [peaks, progress, height]);

  function seekFrom(clientX: number) {
    const canvas = canvasRef.current;
    if (!canvas || !onSeek) return;
    const rect = canvas.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
  }

  return (
    <canvas
      ref={canvasRef}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={onSeek ? 0 : -1}
      className="block w-full touch-none"
      style={{ height }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seekFrom(e.clientX);
      }}
      onPointerMove={(e) => e.buttons > 0 && seekFrom(e.clientX)}
      onKeyDown={(e) => {
        if (!onSeek) return;
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
      }}
    />
  );
}

/** Peaks for the part of a vocal that falls inside [0, duration] of the beat timeline. */
export function vocalTimelineSamples(buffer: AudioBuffer, vocalOffset: number, duration: number): Float32Array {
  const data = buffer.getChannelData(0);
  const from = Math.max(0, Math.round(-vocalOffset * buffer.sampleRate));
  const to = Math.min(data.length, from + Math.round(duration * buffer.sampleRate));
  return data.subarray(from, Math.max(from, to));
}
