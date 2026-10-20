"use client";

import { Sheet } from "@/components/Sheet";
import { buttonClass } from "@/components/ui";

/** Shown before the browser's own permission prompt so people know why we ask. */
export function MicExplainer({ onAllow, onCancel, busy, error }: { onAllow: () => void; onCancel: () => void; busy: boolean; error: string | null }) {
  return (
    <Sheet title="Record your bars" onClose={onCancel}>
      <ul className="flex flex-col gap-3 text-base">
        <li><span className="font-bold text-gold">Mic only while you record.</span> We listen only between Start and Stop.</li>
        <li><span className="font-bold text-gold">Nothing is uploaded</span> unless you tap Save. You can listen back first.</li>
        <li><span className="font-bold text-gold">Wear headphones.</span> Otherwise the mic picks up the beat from your speaker and your vocals sound muddy.</li>
      </ul>
      <p className="mt-4 text-sm text-dim">Next, your browser will ask for microphone access — tap <b>Allow</b>.</p>
      {error && <p role="alert" className="mt-4 rounded-xl bg-danger/15 px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" onClick={onAllow} disabled={busy} className={buttonClass("primary", "min-h-14 w-full text-lg")}>
          {busy ? "Waiting for permission…" : "Allow microphone"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass("ghost", "w-full")}>Not now</button>
      </div>
    </Sheet>
  );
}
