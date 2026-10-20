import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Freestyle" };

export default function Page() {
  return <ComingSoon title="Freestyle" step={3} />;
}
