import type { Metadata } from "next";
import Link from "next/link";
import { distinctValues } from "@lib/beats/library";
import { createClient } from "@/supabase/server";
import { AdminBeatRow, type AdminBeat } from "./AdminBeatRow";
import { UploadBeatForm } from "./UploadBeatForm";

export const metadata: Metadata = { title: "Admin · Beats" };

export default async function AdminBeatsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("beats")
    .select("id, title, producer, bpm, genre, mood, first_downbeat_seconds, duration_seconds, is_premium, is_published, is_placeholder")
    .order("is_placeholder", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const beats: AdminBeat[] = data.map((b) => ({
    id: b.id,
    title: b.title,
    producer: b.producer,
    bpm: Number(b.bpm),
    genre: b.genre,
    mood: b.mood,
    firstDownbeatSeconds: Number(b.first_downbeat_seconds),
    durationSeconds: Number(b.duration_seconds),
    isPremium: b.is_premium,
    isPublished: b.is_published,
    isPlaceholder: b.is_placeholder,
  }));
  const genres = distinctValues(beats, "genre");
  const moods = distinctValues(beats, "mood");

  return (
    <div className="flex flex-col gap-8">
      <header>
        <Link href="/admin" className="text-sm font-semibold text-dim hover:text-fg">← Admin</Link>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none">Beats</h1>
      </header>

      <section className="rounded-2xl border-2 border-line bg-panel p-5">
        <h2 className="font-display text-3xl uppercase">Add a beat</h2>
        <p className="mt-1 text-sm text-dim">MP3, M4A or WAV, up to 50 MB. Only upload beats you have the rights to use.</p>
        <div className="mt-5">
          <UploadBeatForm genres={genres} moods={moods} />
        </div>
      </section>

      <section>
        <h2 className="font-display text-3xl uppercase">All beats ({beats.length})</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {beats.map((beat) => (
            <AdminBeatRow key={beat.id} beat={beat} genres={genres} moods={moods} />
          ))}
        </ul>
      </section>
    </div>
  );
}
