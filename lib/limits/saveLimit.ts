/**
 * Save-limit rules. The database enforces the same rule in
 * `public.can_save_recording()` (supabase/migrations) — keep FREE_SAVE_LIMIT
 * in sync with `public.free_save_limit()` there.
 */
export const FREE_SAVE_LIMIT = 3;

export type Plan = "free" | "premium";

export interface SaveAllowance {
  canSave: boolean;
  /** null means unlimited. */
  limit: number | null;
  /** null means unlimited. */
  remaining: number | null;
}

export function getSaveAllowance(plan: Plan, savedCount: number): SaveAllowance {
  if (!Number.isInteger(savedCount) || savedCount < 0) {
    throw new RangeError(`savedCount must be a non-negative integer, got ${savedCount}`);
  }
  if (plan === "premium") {
    return { canSave: true, limit: null, remaining: null };
  }
  const remaining = Math.max(0, FREE_SAVE_LIMIT - savedCount);
  return { canSave: remaining > 0, limit: FREE_SAVE_LIMIT, remaining };
}

/** Error message raised by the database trigger when the limit is hit. */
export const SAVE_LIMIT_ERROR_MESSAGE = "SAVE_LIMIT_REACHED";

export function isSaveLimitError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes(SAVE_LIMIT_ERROR_MESSAGE));
}
