type ButtonVariant = "primary" | "secondary" | "ghost" | "record";

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 text-base font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-gold text-ink hover:bg-yellow-300",
  secondary: "border-2 border-line bg-panel text-fg hover:border-dim",
  ghost: "text-dim hover:text-fg",
  record: "bg-hot text-white hover:bg-pink-400",
};

export function buttonClass(variant: ButtonVariant = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}

export const inputClass =
  "min-h-12 w-full rounded-xl border-2 border-line bg-panel px-4 text-base text-fg placeholder:text-zinc-500 focus:border-gold focus:outline-none";

export const labelClass = "mb-1.5 block text-sm font-semibold text-dim";
