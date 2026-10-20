import { notFound } from "next/navigation";
import { requireViewer } from "@/auth/viewer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  // Pretend the page doesn't exist for non-admins.
  if (!viewer.isAdmin) notFound();
  return children;
}
