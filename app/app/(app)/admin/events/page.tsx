import { requirePage } from "@/lib/page-guard";
import { EventsClient } from "./EventsClient";

export default async function Page() {
  await requirePage("ADMIN");
  return <EventsClient />;
}
