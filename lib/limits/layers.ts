import type { Plan } from "./saveLimit";

/**
 * Overdub layers per recording. The database enforces the same numbers in
 * `public.layer_limit()` (supabase/migrations) — keep them in sync.
 */
export const FREE_LAYER_LIMIT = 1;
export const PREMIUM_LAYER_LIMIT = 4;

export function layerLimit(plan: Plan): number {
  return plan === "premium" ? PREMIUM_LAYER_LIMIT : FREE_LAYER_LIMIT;
}

export function canAddLayer(plan: Plan, existingLayers: number): boolean {
  return existingLayers < layerLimit(plan);
}

export const LAYER_LIMIT_ERROR_MESSAGE = "LAYER_LIMIT_REACHED";
