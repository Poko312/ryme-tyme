"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FreestyleSettings } from "@lib/session/settings";
import { saveFreestyleSettings } from "./actions";

/** Local settings state that saves to the account shortly after each change. */
export function useFreestyleSettings(initial: FreestyleSettings) {
  const [settings, setSettings] = useState(initial);
  const [saved, setSaved] = useState(true);
  const latest = useRef(initial);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback((patch: Partial<FreestyleSettings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSettings(next);
    setSaved(false);
    // Debounce the save so tapping through options sends one request.
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      void saveFreestyleSettings(next).then((r) => setSaved(r.ok));
    }, 600);
  }, []);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return { settings, update, saved };
}
