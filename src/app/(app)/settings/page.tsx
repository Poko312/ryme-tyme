import type { Metadata } from "next";
import { requireViewer } from "@/auth/viewer";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const viewer = await requireViewer();

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

      <p className="rounded-2xl border-2 border-dashed border-line p-5 text-dim">
        Freestyle settings and latency calibration arrive in steps 3 and 4.
      </p>

      <form action="/auth/signout" method="post">
        <button type="submit" className={buttonClass("secondary", "w-full")}>Log out</button>
      </form>
    </div>
  );
}
