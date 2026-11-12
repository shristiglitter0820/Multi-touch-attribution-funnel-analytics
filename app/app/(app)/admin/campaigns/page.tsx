import { requirePage } from "@/lib/page-guard";
import { CampaignsClient } from "./CampaignsClient";

// Server-side authorization: only ADMIN may render this page (links are hidden for analysts too, but that is not the control).
export default async function Page() {
  await requirePage("ADMIN");
  return <CampaignsClient />;
}
