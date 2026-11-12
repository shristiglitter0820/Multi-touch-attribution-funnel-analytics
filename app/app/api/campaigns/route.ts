import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

// Campaign list with budget status + worst drop-off from the latest snapshot (view v_campaign_overview)
export async function GET() {
  const user = await guard();
  if (user instanceof Response) return user;
  try {
    const rows = await withUser(user, async (c) => {
      const r = await c.query(
        `SELECT campaign_id, name, status, total_budget, spent, pct_used, from_stage, to_stage,
                worst_dropoff_pct, to_char(snapshot_date, 'YYYY-MM-DD') AS snapshot_date
         FROM v_campaign_overview WHERE advertiser_id = $1 ORDER BY campaign_id`,
        [user.advertiserId]
      );
      return r.rows;
    });
    return Response.json(
      rows.map((r) => ({
        campaign_id: r.campaign_id,
        name: r.name,
        status: r.status,
        total_budget: Number(r.total_budget),
        spent: Number(r.spent),
        pct_used: Number(r.pct_used),
        from_stage: r.from_stage,
        to_stage: r.to_stage,
        worst_dropoff_pct: r.worst_dropoff_pct === null ? null : Number(r.worst_dropoff_pct),
        snapshot_date: r.snapshot_date,
      }))
    );
  } catch (e) {
    return dbError(e);
  }
}
