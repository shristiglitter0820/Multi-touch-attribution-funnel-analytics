import { requirePage } from "@/lib/page-guard";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requirePage();
  const { denied } = await searchParams;
  return <DashboardClient role={user.role} denied={denied === "1"} />;
}
