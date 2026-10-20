import { mixDuration, type MixTrack } from "../playback/schedule";
import { keptSegments, outputDuration, type RecordingEdits } from "./edits";

/** Short fades stop clicks at cut points and edges. */
export const CUT_FADE = 0.01;
export const EDGE_FADE = 0.03;
export const MIN_FADE = 0.004;

export interface ScheduledClip {
  track: "beat" | "vocal";
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

/** Every beat/vocal clip to play from output time `from`, honouring trim and cuts. */
export function planEditedPlayback(mix: MixTrack, edits: RecordingEdits, from: number): EditedPlan {
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

    const vocalPos = srcFrom - mix.vocalOffset;
    if (vocalPos >= 0) {
      if (vocalPos < mix.vocalDuration) {
        clips.push({ track: "vocal", delay, fileOffset: vocalPos, duration: Math.min(length, mix.vocalDuration - vocalPos), fadeIn, fadeOut });
      }
    } else if (-vocalPos < length) {
      const wait = -vocalPos;
      clips.push({ track: "vocal", delay: delay + wait, fileOffset: 0, duration: Math.min(length - wait, mix.vocalDuration), fadeIn: MIN_FADE, fadeOut });
    }
  });

  return { duration, clips };
}
