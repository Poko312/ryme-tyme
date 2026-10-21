import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { layerLimit } from "@lib/limits/layers";
import { requireViewer } from "@/auth/viewer";
import { getPlayback } from "@/recordings/actions";
import { EditRecording } from "./EditRecording";

export const metadata: Metadata = { title: "Edit recording" };

export default async function EditRecordingPage({ params }: PageProps<"/recordings/[id]/edit">) {
  const viewer = await requireViewer();
  const premium = viewer.isPremium || viewer.isAdmin;
  const { id } = await params;
  const info = await getPlayback(id);
  if (!info) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/recordings" className="text-sm font-semibold text-dim hover:text-fg">← Recordings</Link>
        <h1 className="mt-2 line-clamp-2 font-display text-4xl uppercase leading-none">{info.title}</h1>
      </header>
      <EditRecording id={id} info={info} isPremium={premium} layerLimit={layerLimit(premium ? "premium" : "free")} />
    </div>
  );
}
