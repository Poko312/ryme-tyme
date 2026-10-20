"use client";

import { useEffect, useId, type ReactNode } from "react";

/** Bottom sheet on phones, centered card on larger screens. */
export function Sheet({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  const titleId = useId();

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-2 border-line bg-panel p-6 pb-safe sm:rounded-3xl"
      >
        <h2 id={titleId} className="font-display text-4xl uppercase leading-none">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
