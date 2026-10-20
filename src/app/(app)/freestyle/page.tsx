import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canPlayBeat } from "@lib/beats/library";
import { requireViewer } from "@/auth/viewer";
import { resolveAudioUrls } from "@/beats/audioUrls";
import { listPublishedBeats } from "@/beats/queries";
import { buttonClass } from "@/components/ui";
import { getFreestyleSettings } from "@/session/preferences";
import { listActiveWords } from "@/words/queries";
import { FreestyleSession } from "./FreestyleSession";

export const metadata: Metadata = { title: "Freestyle" };

export default async function FreestylePage({ searchParams }: PageProps<"/freestyle">) {
  const viewer = await requireViewer();
  const { beat: beatId } = await searchParams;
  const unlocked = viewer.isPremium || viewer.isAdmin;

  const [beats, words, settings] = await Promise.all([
    listPublishedBeats(),
    listActiveWords(),
    getFreestyleSettings(viewer.id),
  ]);

  const requested = typeof beatId === "string" ? beats.find((b) => b.id === beatId) : undefined;
  if (requested && !canPlayBeat(requested, unlocked)) redirect("/upgrade");
  // No beat chosen (e.g. from the Home button): start with the first beat they can play.
  const beat = requested ?? beats.find((b) => canPlayBeat(b, unlocked));

  if (!beat) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-5xl uppercase leading-none">Freestyle</h1>
        <p className="rounded-2xl border-2 border-dashed border-line p-5 text-dim">No beats are available yet.</p>
        <Link href="/beats" className={buttonClass("primary", "w-full")}>Go to beats</Link>
      </div>
    );
  }

  const urls = await resolveAudioUrls([beat]);

  return (
    <FreestyleSession
      // Remount (fresh engine and buffer) when the beat changes.
      key={beat.id}
      beat={{
        id: beat.id,
        title: beat.title,
        producer: beat.producer,
        bpm: beat.bpm,
        genre: beat.genre,
        firstDownbeatSeconds: beat.firstDownbeatSeconds,
      }}
      audioUrl={urls[beat.id] ?? null}
      words={words}
      initialSettings={settings}
    />
  );
}
