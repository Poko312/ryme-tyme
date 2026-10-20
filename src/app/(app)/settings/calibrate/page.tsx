import type { Metadata } from "next";
import Link from "next/link";
import { CalibrationFlow } from "./CalibrationFlow";

export const metadata: Metadata = { title: "Headphone sync" };

export default function CalibratePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/settings" className="text-sm font-semibold text-dim hover:text-fg">← Settings</Link>
        <h1 className="mt-2 font-display text-5xl uppercase leading-none">Headphone sync</h1>
      </header>
      <CalibrationFlow />
    </div>
  );
}
