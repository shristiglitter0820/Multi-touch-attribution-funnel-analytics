// POST /api/events/sync  (Member 1's synchronisation endpoint, same path)
// MongoDB ad_events  ->  PostgreSQL staged_event  ->  fn_process_staged_events():
//   visitors, sessions (30-minute rule), touchpoints, funnel events, conversions, FIRST/LAST/LINEAR attribution, spend.
// Auth: signed-in ADMIN session, or the x-api-key header (for scripts / schedulers).
// Safe to call repeatedly: Mongo _id is the primary key of staged_event, so nothing is imported twice, and one bad event
// is rejected on its own (with a reason) instead of failing the whole run.
import { getSession } from "@/lib/auth";
import { checkApiKey } from "@/lib/ingest-auth";
import { withIngest } from "@/lib/db";
import { eventsCollection } from "@/lib/mongo";
import { toStagedRow, type StagedRow } from "@/lib/events";

const OVERLAP_MS = 10 * 60 * 1000; // re-read a 10-minute overlap before the last high-water mark; staged_event dedupes by _id
const CHUNK = 500;

async function stage(rows: StagedRow[]): Promise<number> {
  const col = <K extends keyof StagedRow>(k: K) => rows.map((r) => r[k]);
  const res = await withIngest((c) =>
    c.query(
      `INSERT INTO staged_event (mongo_event_id, event_type, external_user_id, channel_name, ad_id, device_type, event_time, revenue, order_reference, session_hint)
       SELECT * FROM unnest($1::text[], $2::text[], $3::bigint[], $4::text[], $5::int[], $6::text[], $7::timestamptz[], $8::numeric[], $9::text[], $10::bigint[])
       ON CONFLICT (mongo_event_id) DO NOTHING`,
      [col("mongo_event_id"), col("event_type"), col("external_user_id"), col("channel_name"), col("ad_id"), col("device_type"),
       col("event_time"), col("revenue"), col("order_reference"), col("session_hint")]
    )
  );
  return res.rowCount ?? 0;
}

export async function POST(req: Request) {
  const session = await getSession();
  const key = checkApiKey(req);
  if (session?.role !== "ADMIN" && key !== "ok") {
    return session ? Response.json({ error: "Forbidden for your role" }, { status: 403 }) : Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let col;
  try { col = await eventsCollection(); } catch (e) {
    console.error("mongo unavailable:", (e as Error).message);
    return Response.json({ error: "MongoDB is unavailable" }, { status: 503 });
  }

  const runId: number = (await withIngest((c) => c.query("INSERT INTO etl_run_log (started_at, status) VALUES (now(), 'RUNNING') RETURNING run_id"))).rows[0].run_id;
  try {
    const prev = (await withIngest((c) => c.query("SELECT max(last_event_ts) AS hwm FROM etl_run_log WHERE status = 'SUCCESS'"))).rows[0].hwm as Date | null;
    const filter = prev ? { received_at: { $gte: new Date(prev.getTime() - OVERLAP_MS) } } : {};
    const cursor = col.find(filter).sort({ received_at: 1, _id: 1 }).batchSize(1000);

    let total = 0, stagedNew = 0, malformed = 0;
    let maxReceived: Date | null = null;
    let batch: StagedRow[] = [];
    for await (const doc of cursor) {
      total++;
      if (doc.received_at instanceof Date && (!maxReceived || doc.received_at > maxReceived)) maxReceived = doc.received_at;
      const row = toStagedRow(doc as Record<string, unknown>);
      if (!row) { malformed++; continue; }
      batch.push(row);
      if (batch.length >= CHUNK) { stagedNew += await stage(batch); batch = []; }
    }
    if (batch.length) stagedNew += await stage(batch);

    let synced = 0, rejected = 0, conversions = 0, attribution = 0;
    for (let i = 0; i < 1000; i++) {
      const r = (await withIngest((c) => c.query("SELECT * FROM fn_process_staged_events($1)", [5000]))).rows[0];
      synced += r.processed; rejected += r.rejected; conversions += r.conversions; attribution += r.attribution_rows;
      if (r.processed + r.rejected === 0) break;
    }
    await withIngest((c) => c.query(
      "UPDATE etl_run_log SET finished_at = now(), status = 'SUCCESS', events_ingested = $2, last_event_ts = COALESCE($3::timestamptz, (SELECT max(last_event_ts) FROM etl_run_log WHERE status = 'SUCCESS')) WHERE run_id = $1",
      [runId, stagedNew, maxReceived]));
    return Response.json({
      message: "Event synchronization completed",
      total, synced, skipped: total - synced,       // same keys as Member 1's endpoint
      staged_new: stagedNew, rejected, malformed, conversions_created: conversions, attribution_rows: attribution, run_id: runId,
    });
  } catch (e) {
    console.error("sync failed:", (e as Error).message);
    await withIngest((c) => c.query("UPDATE etl_run_log SET finished_at = now(), status = 'FAILED' WHERE run_id = $1", [runId])).catch(() => {});
    // MongoDB went away mid-run (network / server selection errors): report it as "unavailable" so the cause is clear
    if (/^Mongo(Network|ServerSelection|Topology|PoolCleared)/.test((e as Error).name ?? "")) {
      return Response.json({ error: "MongoDB is unavailable. Nothing was lost; run the synchronisation again when it is back.", run_id: runId }, { status: 503 });
    }
    return Response.json({ error: "Event synchronization failed", run_id: runId }, { status: 500 });
  }
}
