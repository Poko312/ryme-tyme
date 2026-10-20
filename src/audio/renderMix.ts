import type { RecordingEdits } from "@lib/editing/edits";
import { planEditedPlayback } from "@lib/editing/plan";
import type { MixTrack } from "@lib/playback/schedule";
import { createMixGraph } from "./mixGraph";
import { scheduleClip } from "./scheduleClip";

/**
 * Renders the edited mix (beat + vocal + effects) to a stereo AudioBuffer, faster than real time.
 * Uses the same plan and audio chain as live playback, so the result sounds identical.
 * `maxSeconds` limits the length (e.g. 60 s video clips); `from` is on the edited timeline.
 */
export async function renderMix(input: {
  beat: AudioBuffer;
  vocal: AudioBuffer;
  track: MixTrack;
  bpm: number;
  edits: RecordingEdits;
  from?: number;
  maxSeconds?: number;
  sampleRate?: number;
}): Promise<AudioBuffer> {
  const sampleRate = input.sampleRate ?? 44100;
  const plan = planEditedPlayback(input.track, input.edits, input.from ?? 0);
  const length = Math.min(plan.duration - (input.from ?? 0), input.maxSeconds ?? Infinity);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(length * sampleRate)), sampleRate);
  const graph = createMixGraph(ctx, ctx.destination, input.bpm, input.edits);
  for (const clip of plan.clips) {
    if (clip.delay >= length) continue;
    scheduleClip(ctx, { ...clip, duration: Math.min(clip.duration, length - clip.delay) }, clip.track === "beat" ? input.beat : input.vocal, clip.track === "beat" ? graph.beatIn : graph.vocalIn, 0);
  }
  return ctx.startRendering();
}
