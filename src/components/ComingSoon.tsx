export function ComingSoon({ title, step }: { title: string; step: number }) {
  return (
    <div>
      <h1 className="font-display text-5xl uppercase leading-none">{title}</h1>
      <p className="mt-4 rounded-2xl border-2 border-dashed border-line p-5 text-dim">
        Coming in build step {step}.
      </p>
    </div>
  );
}
