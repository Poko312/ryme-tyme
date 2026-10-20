"use client";

import { useEffect } from "react";

/** Keeps the phone screen on while `active` (where supported — iOS 16.4+, Android Chrome). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = () => {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => {
          // denied (e.g. low battery mode) — not critical
        });
    };
    request();
    // The lock is dropped when the tab is hidden; take it again on return.
    const onVisible = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release();
    };
  }, [active]);
}
