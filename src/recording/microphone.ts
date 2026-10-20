/**
 * Microphone access. Echo cancellation and noise suppression are off: they're tuned for calls and
 * mangle rap vocals. Users are asked to wear headphones so the beat doesn't bleed into the mic.
 */
export async function openMicrophone(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicError("unsupported");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicError("denied");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new MicError("no-mic");
    throw new MicError("unknown");
  }
}

export function closeMicrophone(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Label of the active mic (e.g. "AirPods Pro"), used to remember calibration per headset. */
export function microphoneLabel(stream: MediaStream): string {
  return stream.getAudioTracks()[0]?.label || "default";
}

export type MicErrorKind = "denied" | "no-mic" | "unsupported" | "unknown";

export class MicError extends Error {
  constructor(readonly kind: MicErrorKind) {
    super(kind);
  }
}

export const MIC_ERROR_MESSAGES: Record<MicErrorKind, string> = {
  denied:
    "Microphone access is blocked. On iPhone: Settings → Safari → Microphone → Allow (or tap “aA” in the address bar → Website Settings → Microphone). Then reload.",
  "no-mic": "No microphone found. Plug in a headset with a mic, or use your phone's built-in mic.",
  unsupported: "This browser can't record audio. Try Safari on iPhone or Chrome on Android/desktop.",
  unknown: "Couldn't start the microphone. Close other apps using it and try again.",
};
