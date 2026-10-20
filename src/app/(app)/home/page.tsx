import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/auth/viewer";
import { Logo } from "@/components/Logo";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const viewer = await requireViewer();

  return (
    <div className="flex flex-col gap-8">
      <Logo href="/home" />
      <section>
        <p className="text-sm font-bold uppercase tracking-widest text-dim">What&apos;s good,</p>
        <h1 className="font-display text-6xl uppercase leading-none break-words text-gold">@{viewer.username}</h1>
      </section>

      <Link href="/freestyle" className={buttonClass("primary", "min-h-20 w-full text-2xl font-display uppercase tracking-wide")}>
        Start freestyling
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/beats" className="rounded-2xl border-2 border-line bg-panel p-4 hover:border-dim">
          <p className="font-display text-2xl uppercase">Beats</p>
          <p className="text-sm text-dim">Pick your instrumental</p>
        </Link>
        <Link href="/recordings" className="rounded-2xl border-2 border-line bg-panel p-4 hover:border-dim">
          <p className="font-display text-2xl uppercase">Saved</p>
          <p className="text-sm text-dim">Your recordings</p>
        </Link>
      </div>
    </div>
  );
}
