import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canPlayBeat } from "@lib/beats/library";
import { requireViewer } from "@/auth/viewer";
import { getPublishedBeat } from "@/beats/queries";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Freestyle" };

export default async function FreestylePage({ searchParams }: PageProps<"/freestyle">) {
  const viewer = await requireViewer();
  const { beat: beatId } = await searchParams;
  const beat = typeof beatId === "string" ? await getPublishedBeat(beatId).catch(() => null) : null;

  if (beat && !canPlayBeat(beat, viewer.isPremium || viewer.isAdmin)) redirect("/upgrade");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-5xl uppercase leading-none">Freestyle</h1>
      {beat ? (
        <div className="rounded-2xl border-2 border-gold bg-panel p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-dim">Beat selected</p>
          <p className="mt-1 text-2xl font-bold">{beat.title}</p>
          <p className="text-dim">{Math.round(beat.bpm)} BPM · {beat.genre}</p>
        </div>
      ) : (
        <Link href="/beats" className={buttonClass("primary", "w-full")}>Pick a beat</Link>
      )}
      <p className="rounded-2xl border-2 border-dashed border-line p-5 text-dim">
        The freestyle session (words on the beat) arrives in build step 3.
      </p>
    </div>
  );
}
