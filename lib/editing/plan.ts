import { mixDuration, type MixTrack } from "../playback/schedule";
import { keptSegments, outputDuration, type RecordingEdits } from "./edits";

/** Short fades stop clicks at cut points and edges. */
export const CUT_FADE = 0.01;
export const EDGE_FADE = 0.03;
export const MIN_FADE = 0.004;

export interface ScheduledClip {
  track: "beat" | "vocal" | "layer";
  /** Which overdub layer (index into the `layers` passed in), when track is "layer". */
  layer?: number;
  /** Seconds after playback starts. */
  delay: number;
  /** Where in the audio file to start. */
  fileOffset: number;
  duration: number;
  fadeIn: number;
  fadeOut: number;
}

export interface EditedPlan {
  /** Length of the edited output. */
  duration: number;
  clips: ScheduledClip[];
}

/** An overdub layer placed on the beat timeline, like the main vocal. */
export interface LayerTrack {
  offset: number;
  duration: number;
}

/**
 * Every beat/vocal/layer clip to play from output time `from`, honouring trim and cuts.
 * Layers sit on the beat timeline, so cuts and trims apply to them exactly as to the main vocal.
 */
export function planEditedPlayback(mix: MixTrack, edits: RecordingEdits, from: number, layers: LayerTrack[] = []): EditedPlan {
  const segments = keptSegments(edits, mixDuration(mix));
  const duration = outputDuration(segments);
  const start = Math.max(0, Math.min(from, duration));
  const clips: ScheduledClip[] = [];

  segments.forEach((seg, i) => {
    const segLen = seg.sourceEnd - seg.sourceStart;
    const outEnd = seg.outputStart + segLen;
    if (outEnd <= start + 1e-9) return;
    const outFrom = Math.max(start, seg.outputStart);
    const atBoundary = outFrom === seg.outputStart;
    const srcFrom = seg.sourceStart + (outFrom - seg.outputStart);
    const length = seg.sourceEnd - srcFrom;
    const delay = outFrom - start;
    const last = i === segments.length - 1;
    const fadeIn = atBoundary && i > 0 ? CUT_FADE : atBoundary && edits.trim && edits.trim.start > 0 ? EDGE_FADE : MIN_FADE;
    const fadeOut = !last ? CUT_FADE : edits.trim ? EDGE_FADE : MIN_FADE;

    clips.push({ track: "beat", delay, fileOffset: mix.beatFirstDownbeat + srcFrom, duration: length, fadeIn, fadeOut });

    const vocalClip = (offset: number, fileDuration: number): Omit<ScheduledClip, "track"> | null => {
      const pos = srcFrom - offset;
      if (pos >= 0) {
        return pos < fileDuration ? { delay, fileOffset: pos, duration: Math.min(length, fileDuration - pos), fadeIn, fadeOut } : null;
      }
      const wait = -pos; // this vocal starts later than the playback point
      return wait < length ? { delay: delay + wait, fileOffset: 0, duration: Math.min(length - wait, fileDuration), fadeIn: MIN_FADE, fadeOut } : null;
    };

    const main = vocalClip(mix.vocalOffset, mix.vocalDuration);
    if (main) clips.push({ track: "vocal", ...main });
    layers.forEach((layer, index) => {
      const clip = vocalClip(layer.offset, layer.duration);
      if (clip) clips.push({ track: "layer", layer: index, ...clip });
    });
  });

  return { duration, clips };
}
