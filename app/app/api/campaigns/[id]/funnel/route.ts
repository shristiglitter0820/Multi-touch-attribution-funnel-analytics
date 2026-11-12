import { z } from "zod";
import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date");
const Query = z.object({
  source: z.enum(["live", "snapshot"]).default("live"),
  from: date.optional(),
  to: date.optional(),
}).refine((q) => !(q.from && q.to) || q.from <= q.to, { message: "'From' date must not be after 'To' date" });

// GET /api/campaigns/1/funnel?source=live|snapshot&from=2026-09-01&to=2026-10-01
//   live     : fn_campaign_funnel(), honours the date range
//   snapshot : latest stored row set in v_funnel_latest (cumulative through its snapshot_date; dates ignored)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await guard();
  if (user instanceof Response) return user;

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Invalid campaign id" }, { status: 400 });
  const sp = new URL(req.url).searchParams;
  const q = Query.safeParse({
    source: sp.get("source") ?? undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  });
  if (!q.success) return Response.json({ error: q.error.issues[0].message }, { status: 400 });
  const { source, from, to } = q.data;

  try {
    const result = await withUser(user, async (c) => {
      const own = await c.query("SELECT 1 FROM campaign WHERE campaign_id = $1 AND advertiser_id = $2", [id, user.advertiserId]);
      if (own.rowCount === 0) return null;
      if (source === "live") {
        const r = await c.query("SELECT * FROM fn_campaign_funnel($1, $2::date, $3::date)", [id, from ?? null, to ?? null]);
        return {
          snapshot_date: null as string | null,
          stages: r.rows.map((s) => ({
            stage: s.stage_name as string, order: s.stage_order as number, visitors: Number(s.visitors),
            pct_of_previous: Number(s.pct_of_previous), dropoff_pct: Number(s.dropoff_pct),
            pct_of_top: s.pct_of_top === null ? 0 : Number(s.pct_of_top),
          })),
        };
      }
      const r = await c.query(
        `SELECT stage_order, stage_name, visitor_count, dropoff_rate, to_char(snapshot_date, 'YYYY-MM-DD') AS snapshot_date
         FROM v_funnel_latest WHERE campaign_id = $1 ORDER BY stage_order`, [id]);
      const top = r.rows[0]?.visitor_count ?? 0;
      return {
        snapshot_date: (r.rows[0]?.snapshot_date ?? null) as string | null,
        stages: r.rows.map((s) => ({
          stage: s.stage_name as string, order: s.stage_order as number, visitors: Number(s.visitor_count),
          pct_of_previous: s.stage_order === 1 ? 100 : Math.round((100 - Number(s.dropoff_rate)) * 100) / 100,
          dropoff_pct: Number(s.dropoff_rate),
          pct_of_top: top > 0 ? Math.round((10000 * Number(s.visitor_count)) / top) / 100 : 0,
        })),
      };
    });
    if (!result) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return Response.json({ source, from: from ?? null, to: to ?? null, ...result });
  } catch (e) {
    return dbError(e);
  }
}
