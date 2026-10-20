import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Recordings" };

export default function Page() {
  return <ComingSoon title="Recordings" step={4} />;
}
