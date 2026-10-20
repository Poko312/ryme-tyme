import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/auth/viewer";
import { CheckIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Go Premium" };

const PERKS = [
  "Every beat in the library",
  "Unlimited saved recordings",
  "No watermark on video clips",
];

export default async function UpgradePage() {
  const viewer = await requireViewer();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-hot">Rhyme Tyme</p>
        <h1 className="font-display text-6xl uppercase leading-none">
          Go <span className="text-gold">Premium</span>
        </h1>
      </header>

      <ul className="flex flex-col gap-3">
        {PERKS.map((perk) => (
          <li key={perk} className="flex items-center gap-3 rounded-2xl border-2 border-line bg-panel p-4 text-lg font-semibold">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold text-ink">
              <CheckIcon />
            </span>
            {perk}
          </li>
        ))}
      </ul>

      <p className="font-display text-4xl">
        $4.99<span className="text-xl text-dim"> / month</span>
      </p>

      {viewer.isPremium ? (
        <p className="rounded-2xl border-2 border-gold p-5 font-semibold">You&apos;re Premium. Thanks for the support!</p>
      ) : (
        <>
          <button type="button" disabled className={buttonClass("primary", "min-h-16 w-full font-display text-2xl uppercase")}>
            Upgrade
          </button>
          <p className="text-center text-sm text-dim">Checkout opens in build step 6.</p>
        </>
      )}

      <Link href="/beats" className={buttonClass("ghost")}>Back to beats</Link>
    </div>
  );
}
