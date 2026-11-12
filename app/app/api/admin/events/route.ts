import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

// GET /api/admin/events  (ADMIN only): sync status for the Events page
export async function GET() {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  try {
    const out = await withUser(user, async (c) => {
      const counts = await c.query("SELECT status, COUNT(*)::int AS n FROM staged_event GROUP BY status");
      const runs = await c.query("SELECT run_id, started_at, finished_at, status, events_ingested, last_event_ts FROM etl_run_log ORDER BY run_id DESC LIMIT 10");
      const rejected = await c.query(
        "SELECT mongo_event_id, event_type, external_user_id, channel_name, event_time, reject_reason FROM staged_event WHERE status = 'REJECTED' ORDER BY processed_at DESC NULLS LAST, mongo_event_id LIMIT 25");
      return { counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])), runs: runs.rows, rejected: rejected.rows };
    });
    return Response.json(out);
  } catch (e) {
    return dbError(e);
  }
}
