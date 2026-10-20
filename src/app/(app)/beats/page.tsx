import type { Metadata } from "next";
import { canPlayBeat } from "@lib/beats/library";
import { requireViewer } from "@/auth/viewer";
import { resolveAudioUrls } from "@/beats/audioUrls";
import { listPublishedBeats } from "@/beats/queries";
import { BeatLibrary, type LibraryBeat } from "./BeatLibrary";

export const metadata: Metadata = { title: "Beat library" };

export default async function BeatsPage() {
  const viewer = await requireViewer();
  const unlocked = viewer.isPremium || viewer.isAdmin;
  const beats = await listPublishedBeats();

  const playable = beats.filter((b) => canPlayBeat(b, unlocked));
  const urls = await resolveAudioUrls(playable);

  // Never send storage paths to the browser — only URLs for beats this viewer may play.
  const libraryBeats: LibraryBeat[] = beats.map((beat) => ({
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    bpm: beat.bpm,
    genre: beat.genre,
    mood: beat.mood,
    durationSeconds: beat.durationSeconds,
    firstDownbeatSeconds: beat.firstDownbeatSeconds,
    isPremium: beat.isPremium,
    locked: !canPlayBeat(beat, unlocked),
    audioUrl: urls[beat.id] ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-5xl uppercase leading-none">Beats</h1>
        <p className="mt-2 text-dim">Tap play for a preview. Pick one to start freestyling.</p>
      </header>
      <BeatLibrary beats={libraryBeats} />
    </div>
  );
}
