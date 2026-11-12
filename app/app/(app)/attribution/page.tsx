import { requirePage } from "@/lib/page-guard";
import { AttributionClient } from "./AttributionClient";

export default async function Page() {
  await requirePage();   // ADMIN and ANALYST
  return <AttributionClient />;
}
