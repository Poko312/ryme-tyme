import type { ScheduledClip } from "@lib/editing/plan";

/** Plays one planned clip into `destination` with click-free fades. Works on live and offline contexts. */
export function scheduleClip(
  ctx: BaseAudioContext,
  clip: ScheduledClip,
  buffer: AudioBuffer,
  destination: AudioNode,
  when: number,
): { source: AudioBufferSourceNode; gain: GainNode } {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  const t0 = when + clip.delay;
  const t1 = t0 + clip.duration;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(1, t0 + clip.fadeIn);
  gain.gain.setValueAtTime(1, Math.max(t0 + clip.fadeIn, t1 - clip.fadeOut));
  gain.gain.linearRampToValueAtTime(0, t1);
  source.connect(gain).connect(destination);
  source.start(t0, clip.fileOffset, clip.duration);
  return { source, gain };
}
