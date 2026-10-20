"use client";

import { useEffect, useState } from "react";
import { getAudioContext } from "./context";

type BufferState =
  | { status: "loading" }
  | { status: "ready"; buffer: AudioBuffer }
  | { status: "error"; message: string };

/** Downloads and decodes a beat so it can be scheduled sample-accurately with Web Audio. */
export function useBeatBuffer(url: string | null): BufferState {
  const [state, setState] = useState<BufferState>({ status: "loading" });

  useEffect(() => {
    if (!url) return;
    const abort = new AbortController();
    (async () => {
      try {
        const response = await fetch(url, { signal: abort.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        // Decoding doesn't need a running context, so this works before the first tap.
        const buffer = await getAudioContext().decodeAudioData(bytes);
        if (!abort.signal.aborted) setState({ status: "ready", buffer });
      } catch (err) {
        if (abort.signal.aborted) return;
        console.error("[beat] load failed", err);
        setState({ status: "error", message: "Couldn't load this beat. Check your connection and reload." });
      }
    })();
    return () => abort.abort();
  }, [url]);

  return url ? state : { status: "error", message: "This beat has no audio." };
}
