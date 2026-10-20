/** A short metronome click at audio-clock time `at`. Returns the node so it can be stopped early. */
export function scheduleClick(ctx: AudioContext, at: number, accent: boolean): OscillatorNode {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = accent ? 1600 : 1000;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.7 : 0.45, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.08);
  return osc;
}
