import type { RecordingEdits } from "./edits";

/**
 * Undo history for the editor. Changes that arrive in quick succession (dragging a handle or a
 * slider fires dozens of updates) are grouped into one undo step. Time is passed in (ms).
 */
export interface EditHistory {
  past: RecordingEdits[];
  lastChangeAt: number;
}

export const UNDO_GROUP_MS = 700;
export const MAX_UNDO = 50;

export const EMPTY_HISTORY: EditHistory = { past: [], lastChangeAt: -Infinity };

/** Call before applying a change; `previous` is the edits as they were before it. */
export function recordChange(history: EditHistory, previous: RecordingEdits, nowMs: number): EditHistory {
  const continuing = nowMs - history.lastChangeAt < UNDO_GROUP_MS;
  if (continuing) return { ...history, lastChangeAt: nowMs };
  const past = [...history.past, previous].slice(-MAX_UNDO);
  return { past, lastChangeAt: nowMs };
}

/** Returns the edits to restore, or null if there's nothing to undo. */
export function undo(history: EditHistory): { history: EditHistory; edits: RecordingEdits | null } {
  if (history.past.length === 0) return { history, edits: null };
  const past = history.past.slice(0, -1);
  return { history: { past, lastChangeAt: -Infinity }, edits: history.past[history.past.length - 1] };
}
