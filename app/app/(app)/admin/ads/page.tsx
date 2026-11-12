import { requirePage } from "@/lib/page-guard";
import { AdsClient } from "./AdsClient";

// Server-side authorization: only ADMIN may render this page (links are hidden for analysts too, but that is not the control).
export default async function Page() {
  await requirePage("ADMIN");
  return <AdsClient />;
}
