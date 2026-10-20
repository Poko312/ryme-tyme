import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";

export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8 pb-safe">
      <Logo />
      <h1 className="mt-10 font-display text-5xl uppercase leading-none">{title}</h1>
      <div className="mt-8 flex flex-col gap-6">{children}</div>
    </main>
  );
}
