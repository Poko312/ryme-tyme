import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Admin" };

const SECTIONS = [
  { href: "/admin/beats", title: "Beats", body: "Upload and manage beats", ready: true },
  { href: "#", title: "Words", body: "Manage prompt words — build step 8", ready: false },
  { href: "#", title: "Reports", body: "Review reports — build step 8", ready: false },
];

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-5xl uppercase leading-none">Admin</h1>
      <ul className="flex flex-col gap-3">
        {SECTIONS.map((s) => (
          <li key={s.title}>
            {s.ready ? (
              <Link href={s.href} className="block rounded-2xl border-2 border-line bg-panel p-4 hover:border-gold">
                <p className="font-display text-2xl uppercase">{s.title}</p>
                <p className="text-sm text-dim">{s.body}</p>
              </Link>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-line p-4 opacity-60">
                <p className="font-display text-2xl uppercase">{s.title}</p>
                <p className="text-sm text-dim">{s.body}</p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
