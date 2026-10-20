import { requireViewer } from "@/auth/viewer";
import { BottomNav } from "@/components/BottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();

  return (
    <>
      <main className="mx-auto w-full max-w-xl flex-1 px-5 pt-6 pb-32">{children}</main>
      <BottomNav />
    </>
  );
}
