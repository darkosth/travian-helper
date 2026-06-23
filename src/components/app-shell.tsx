import { BottomNav } from "@/components/bottom-nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 pb-28 pt-6 sm:px-6 lg:px-8">
        {children}
      </div>
      <BottomNav />
    </>
  );
}
