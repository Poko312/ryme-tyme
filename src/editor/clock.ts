/**
 * Wall-clock milliseconds for grouping undo steps. Only ever called from event handlers; it lives
 * outside the component so the React compiler doesn't mistake it for an impure call during render.
 */
export const nowMs = () => Date.now();
