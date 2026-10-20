import type { Metadata } from "next";
import Link from "next/link";
import { FREE_SAVE_LIMIT } from "@lib/limits/saveLimit";
import { requireViewer } from "@/auth/viewer";
import { buttonClass } from "@/components/ui";
import { createClient } from "@/supabase/server";
import { RecordingsList, type RecordingItem } from "./RecordingsList";

export const metadata: Metadata = { title: "Recordings" };

export default async function RecordingsPage({ searchParams }: PageProps<"/recordings">) {
  const viewer = await requireViewer();
  const { saved } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recordings")
    .select("id, title, created_at, duration_seconds, beat:beats(title)")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const items: RecordingItem[] = data.map((r) => {
    // Supabase returns the joined row as an object (or null if the beat is hidden from this user).
    const beat = r.beat as unknown as { title: string } | null;
    return {
      id: r.id,
      title: r.title,
      createdAt: r.created_at,
      durationSeconds: Number(r.duration_seconds),
      beatTitle: beat?.title ?? "Beat no longer listed",
    };
  });
  const unlimited = viewer.isPremium;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-5xl uppercase leading-none">Recordings</h1>
        {!unlimited && (
          <p className="mt-2 text-dim">
            <span className={items.length >= FREE_SAVE_LIMIT ? "font-bold text-gold" : ""}>
              {Math.min(items.length, FREE_SAVE_LIMIT)} of {FREE_SAVE_LIMIT} free saves used
            </span>
            {" · "}
            <Link href="/upgrade" className="font-semibold text-gold underline-offset-4 hover:underline">Unlimited with Premium</Link>
          </p>
        )}
      </header>

      {typeof saved === "string" && items.some((i) => i.id === saved) && (
        <p role="status" className="rounded-xl border-2 border-gold bg-gold/10 px-4 py-3 font-semibold">Saved! 🔥 Your take is below.</p>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line p-6 text-center">
          <p className="text-dim">No recordings yet. Turn on <b>Record</b> before you start a freestyle.</p>
          <Link href="/freestyle" className={buttonClass("primary", "mt-4 w-full")}>Start freestyling</Link>
        </div>
      ) : (
        <RecordingsList items={items} highlightId={typeof saved === "string" ? saved : null} />
      )}
    </div>
  );
}
