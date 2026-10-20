import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer, needsOnboarding } from "@/auth/viewer";
import { Logo } from "@/components/Logo";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Set up your account" };

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!needsOnboarding(viewer)) redirect("/home");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8 pb-safe">
      <Logo href="/home" />
      <h1 className="mt-10 font-display text-5xl uppercase leading-none">One more thing</h1>
      <p className="mt-3 text-dim">Choose the name people will see on your freestyles.</p>
      <div className="mt-8">
        <OnboardingForm defaultUsername={viewer.username ?? ""} />
      </div>
    </main>
  );
}
