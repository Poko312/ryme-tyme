import Link from "next/link";
import { Logo } from "@/components/Logo";
import { buttonClass } from "@/components/ui";

const STEPS = [
  { n: "01", title: "Pick a beat", body: "Boom bap, trap, lo-fi, drill — choose your vibe." },
  { n: "02", title: "Words drop on the beat", body: "A new prompt lands on the downbeat every few bars. Work it into your verse." },
  { n: "03", title: "Record & share", body: "Save your best takes and share a clip with your crew." },
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-8 pb-safe">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className={buttonClass("ghost", "px-3")}>Log in</Link>
      </header>

      <section className="mt-16">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-hot">Freestyle trainer</p>
        <h1 className="mt-3 font-display text-7xl uppercase leading-[0.9] sm:text-8xl">
          Never run out of <span className="text-gold">bars</span>.
        </h1>
        <p className="mt-6 text-lg text-dim">
          Rap over real beats while prompt words drop right on the downbeat. Catch the word, flip it, keep the flow.
        </p>
      </section>

      {/* Mock of the freestyle screen */}
      <div aria-hidden="true" className="mt-10 rounded-3xl border-2 border-line bg-panel p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-dim">Bar 9 · 90 BPM</p>
        <p className="mt-2 font-display text-7xl uppercase text-gold">Money</p>
        <p className="mt-1 text-dim">next: <span className="font-semibold text-fg">thunder</span></p>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full w-2/3 rounded-full bg-hot" />
        </div>
      </div>

      <div className="mt-10 flex flex-col gap-3">
        <Link href="/signup" className={buttonClass("primary", "min-h-16 w-full font-display text-2xl uppercase tracking-wide")}>
          Start freestyling
        </Link>
        <p className="text-center text-sm text-dim">Free to start · 13+</p>
      </div>

      <section className="mt-16 flex flex-col gap-6">
        {STEPS.map((s) => (
          <div key={s.n} className="flex gap-4">
            <span className="font-display text-4xl text-hot">{s.n}</span>
            <div>
              <h2 className="font-display text-2xl uppercase">{s.title}</h2>
              <p className="text-dim">{s.body}</p>
            </div>
          </div>
        ))}
      </section>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-dim">© Rhyme Tyme</footer>
    </main>
  );
}
