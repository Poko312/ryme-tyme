import type { Metadata } from "next";
import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Beat library" };

export default function Page() {
  return <ComingSoon title="Beat library" step={2} />;
}
