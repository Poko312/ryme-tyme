/**
 * One shared AudioContext for the whole app (browsers limit how many you can create).
 * iPhone Safari: the context starts "suspended" and may only be resumed inside a tap/click
 * handler, so call unlockAudio() at the very start of a click handler, before any await.
 */
let context: AudioContext | null = null;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function getAudioContext(): AudioContext {
  if (!context) {
    // Safari 17+: play through the ring/silent switch like a music app does.
    const nav = navigator as AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = "playback";

    const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    context = new Ctor({ latencyHint: "interactive" });
  }
  return context;
}

export async function unlockAudio(): Promise<AudioContext> {
  const ctx = getAudioContext();
  // "interrupted" is an iOS-only state (e.g. after a phone call).
  if (ctx.state !== "running") await ctx.resume();
  return ctx;
}
