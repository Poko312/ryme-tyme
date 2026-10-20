"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { getCalibratedRoundTrip } from "@/recording/latencyStore";
import { buttonClass } from "@/components/ui";

// Calibration lives in this browser's storage, so read it on the client only.
const subscribe = () => () => {};

export function CalibrationStatus() {
  const roundTrip = useSyncExternalStore(subscribe, () => getCalibratedRoundTrip(null), () => undefined);

  return (
    <section className="rounded-2xl border-2 border-line bg-panel p-5">
      <h2 className="text-sm font-bold uppercase tracking-widest text-dim">Headphone sync</h2>
      <p className="mt-2">
        {roundTrip === undefined
          ? "…"
          : roundTrip === null
            ? "Not calibrated yet. Takes 20 seconds and makes recordings line up with the beat."
            : `Calibrated: ${Math.round(roundTrip * 1000)} ms delay.`}
      </p>
      <Link href="/settings/calibrate" className={buttonClass("secondary", "mt-4 w-full")}>
        {roundTrip ? "Recalibrate" : "Calibrate headphones"}
      </Link>
    </section>
  );
}
