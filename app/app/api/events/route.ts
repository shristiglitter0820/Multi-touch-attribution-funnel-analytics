// POST /api/events  (Member 1's ingestion endpoint, same path, same request/response shape)
// Validates an ad event and stores it, untouched, in MongoDB (db MONGODB_DB, collection ad_events).
// Auth: x-api-key header = INGEST_API_KEY (called by ad servers / trackers, not by browsers).
import { checkApiKey } from "@/lib/ingest-auth";
import { validateEvent } from "@/lib/events";
import { eventsCollection } from "@/lib/mongo";

const MAX_BODY_BYTES = 100 * 1024;

export async function POST(req: Request) {
  const key = checkApiKey(req);
  if (key === "not_configured") return Response.json({ error: "Event ingestion is not configured on this server" }, { status: 503 });
  if (key === "invalid") return Response.json({ error: "Invalid or missing API key" }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return Response.json({ error: "Request body too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: "Request body must be valid JSON" }, { status: 400 }); }

  const v = validateEvent(body);
  if (!v.ok) return Response.json(v.body, { status: v.status });

  const now = new Date();
  const event = { ...v.event, event_time: now, received_at: now };
  try {
    const col = await eventsCollection();
    const r = await col.insertOne(event);
    return Response.json({ message: "Event stored successfully", event_id: r.insertedId, event: { ...event, _id: r.insertedId } }, { status: 201 });
  } catch (e) {
    console.error("event store failed:", (e as Error).message);
    return Response.json({ error: "Event store unavailable" }, { status: 503 });
  }
}
