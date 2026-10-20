/**
 * Calibrated round-trip latency, remembered per device in this browser (headphones differ a lot,
 * so it's keyed by the mic's label — AirPods report their own mic).
 */
const KEY = "rt.latency.v1";

interface Stored {
  [micLabel: string]: { roundTrip: number; at: string };
}

function read(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

export function getCalibratedRoundTrip(micLabel: string | null): number | null {
  const stored = read();
  const entry = (micLabel && stored[micLabel]) || stored.last;
  return entry && Number.isFinite(entry.roundTrip) ? entry.roundTrip : null;
}

export function saveCalibratedRoundTrip(micLabel: string, roundTrip: number) {
  try {
    const stored = read();
    const entry = { roundTrip, at: new Date().toISOString() };
    stored[micLabel] = entry;
    stored.last = entry;
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // private mode / storage full — calibration just won't persist
  }
}

/** Rough guess when uncalibrated: output latency both ways plus a little for the mic. */
export function defaultRoundTrip(estimatedOutputLatency: number): number {
  return estimatedOutputLatency * 2 + 0.02;
}
