import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LoadingState } from "@/components/ui";
import { getSession } from "@/lib/auth";

// Shared shell (nav + user chip) for every signed-in page.
// Reading the session cookie is request-time data, so it lives inside <Suspense> (Next.js 16 Cache Components).
// Each page still authorizes itself (see lib/page-guard.ts); the layout is not the security control.
async function Shell({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");
  return <AppShell user={{ name: user.name, role: user.role }}>{children}</AppShell>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-6xl px-4 py-10"><LoadingState label="Loading..." /></div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
