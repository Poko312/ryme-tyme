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
  /** Overdub layers (muted ones are skipped). */
  layers?: { buffer: AudioBuffer; offset: number; gain: number; muted: boolean }[];
  from?: number;
  maxSeconds?: number;
  sampleRate?: number;
}): Promise<AudioBuffer> {
  const sampleRate = input.sampleRate ?? 44100;
  const layers = (input.layers ?? []).filter((l) => !l.muted && l.gain > 0);
  const plan = planEditedPlayback(input.track, input.edits, input.from ?? 0, layers.map((l) => ({ offset: l.offset, duration: l.buffer.duration })));
  const length = Math.min(plan.duration - (input.from ?? 0), input.maxSeconds ?? Infinity);
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(length * sampleRate)), sampleRate);
  const graph = createMixGraph(ctx, ctx.destination, input.bpm, input.edits);
  const layerGains = layers.map((l) => {
    const g = ctx.createGain();
    g.gain.value = l.gain;
    g.connect(graph.vocalIn);
    return g;
  });
  for (const clip of plan.clips) {
    if (clip.delay >= length) continue;
    const trimmed = { ...clip, duration: Math.min(clip.duration, length - clip.delay) };
    if (clip.track === "beat") scheduleClip(ctx, trimmed, input.beat, graph.beatIn, 0);
    else if (clip.track === "vocal") scheduleClip(ctx, trimmed, input.vocal, graph.vocalIn, 0);
    else if (clip.layer !== undefined) scheduleClip(ctx, trimmed, layers[clip.layer].buffer, layerGains[clip.layer], 0);
  }
  return ctx.startRendering();
}
