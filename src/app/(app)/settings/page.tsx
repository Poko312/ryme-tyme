import type { Metadata } from "next";
import Link from "next/link";
import { requireViewer } from "@/auth/viewer";
import { buttonClass } from "@/components/ui";
import { getFreestyleSettings } from "@/session/preferences";
import { CalibrationStatus } from "@/session/CalibrationStatus";
import { FreestyleSettingsSection } from "@/session/SettingsSection";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();
  const freestyle = await getFreestyleSettings(viewer.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-5xl uppercase leading-none">Settings</h1>

      <section className="rounded-2xl border-2 border-line bg-panel p-5">
        <h2 className="text-sm font-bold uppercase tracking-widest text-dim">Account</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          <dt className="text-dim">Username</dt>
          <dd className="font-semibold">@{viewer.username}</dd>
          <dt className="text-dim">Email</dt>
          <dd className="truncate font-semibold">{viewer.email}</dd>
          {viewer.isAdmin && (
            <>
              <dt className="text-dim">Role</dt>
              <dd className="font-semibold text-gold">Admin</dd>
            </>
          )}
        </dl>
      </section>

      {viewer.isAdmin && (
        <Link href="/admin" className={buttonClass("secondary", "w-full")}>Admin tools</Link>
      )}

      <FreestyleSettingsSection initial={freestyle} />

      <CalibrationStatus />

      <form action="/auth/signout" method="post">
        <button type="submit" className={buttonClass("secondary", "w-full")}>Log out</button>
      </form>
    </div>
  );
}
