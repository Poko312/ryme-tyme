import { generateImpulse } from "@lib/audio/impulse";
import type { RecordingEdits } from "@lib/editing/edits";

/**
 * The one audio chain used everywhere a recording is played or rendered (review, editor,
 * Recordings page, share page, video export), so edits sound identical in all of them.
 * Works on a live AudioContext and on an OfflineAudioContext.
 *
 *   beatIn ──► beatGain ───────────────────────────────┐
 *   vocalIn ─► vocalGain ─┬──────────────────── dry ───┤
 *                         ├─► reverbSend ─► convolver ─┤──► limiter ──► destination
 *                         └─► echoSend ──► delay ⟲ ────┘
 */
export interface MixGraph {
  beatIn: AudioNode;
  vocalIn: AudioNode;
  apply(edits: Pick<RecordingEdits, "mix" | "effects">): void;
  dispose(): void;
}

/** Echo lands on the dotted eighth — the classic rap vocal throw. */
const ECHO_BEATS = 0.75;
const ECHO_FEEDBACK = 0.35;
const RAMP = 0.03;

export function createMixGraph(ctx: BaseAudioContext, destination: AudioNode, bpm: number, edits: Pick<RecordingEdits, "mix" | "effects">): MixGraph {
  const beatIn = ctx.createGain();
  const vocalIn = ctx.createGain();
  const beatGain = ctx.createGain();
  const vocalGain = ctx.createGain();
  const reverbSend = ctx.createGain();
  const echoSend = ctx.createGain();
  const convolver = ctx.createConvolver();
  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  const output = ctx.createGain();

  const impulse = generateImpulse(ctx.sampleRate);
  const ir = ctx.createBuffer(impulse.length, impulse[0].length, ctx.sampleRate);
  impulse.forEach((data, c) => ir.copyToChannel(data as Float32Array<ArrayBuffer>, c));
  convolver.buffer = ir;

  delay.delayTime.value = (60 / bpm) * ECHO_BEATS;
  feedback.gain.value = ECHO_FEEDBACK;

  // Limiter so boosted vocals don't clip, plus a little headroom for its overshoot.
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;
  output.gain.value = 0.85;

  beatIn.connect(beatGain).connect(limiter);
  vocalIn.connect(vocalGain);
  vocalGain.connect(limiter);
  vocalGain.connect(reverbSend).connect(convolver).connect(limiter);
  vocalGain.connect(echoSend).connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(limiter);
  limiter.connect(output).connect(destination);

  const nodes: AudioNode[] = [beatIn, vocalIn, beatGain, vocalGain, reverbSend, echoSend, convolver, delay, feedback, limiter, output];

  const apply: MixGraph["apply"] = (e) => {
    const now = ctx.currentTime;
    const set = (param: AudioParam, value: number) => {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, RAMP);
    };
    set(beatGain.gain, e.mix.beatGain);
    set(vocalGain.gain, e.mix.vocalGain);
    set(reverbSend.gain, e.effects.reverb * 0.7);
    set(echoSend.gain, e.effects.echo * 0.55);
  };
  // Initial values are set directly so an offline render starts at the right levels.
  beatGain.gain.value = edits.mix.beatGain;
  vocalGain.gain.value = edits.mix.vocalGain;
  reverbSend.gain.value = edits.effects.reverb * 0.7;
  echoSend.gain.value = edits.effects.echo * 0.55;

  return {
    beatIn,
    vocalIn,
    apply,
    dispose: () => nodes.forEach((n) => n.disconnect()),
  };
}
