import { z } from "zod";
import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

const Query = z.object({ model: z.enum(["FIRST_TOUCH", "LAST_TOUCH", "LINEAR"]).default("LAST_TOUCH") });
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// GET /api/analytics/roi?model=LAST_TOUCH   (ADMIN + ANALYST): spend, CTR, conversion rate, ROI per campaign (view v_campaign_roi)
export async function GET(req: Request) {
  const user = await guard();
  if (user instanceof Response) return user;
  const q = Query.safeParse({ model: new URL(req.url).searchParams.get("model") ?? undefined });
  if (!q.success) return Response.json({ error: "model must be FIRST_TOUCH, LAST_TOUCH or LINEAR" }, { status: 400 });
  try {
    const rows = await withUser(user, async (c) =>
      (await c.query("SELECT * FROM v_campaign_roi WHERE advertiser_id = $1 AND model_name = $2 ORDER BY campaign_id", [user.advertiserId, q.data.model])).rows);
    return Response.json({
      model: q.data.model,
      campaigns: rows.map((r) => ({
        campaign_id: r.campaign_id, campaign_name: r.campaign_name, spend: num(r.spend), impressions: Number(r.impressions), clicks: Number(r.clicks),
        ctr_pct: num(r.ctr_pct), credited_conversions: num(r.credited_conversions), attributed_revenue: num(r.attributed_revenue),
        conversion_rate_pct: num(r.conversion_rate_pct), roi_pct: num(r.roi_pct), roas: num(r.roas), cpa: num(r.cpa),
      })),
    });
  } catch (e) {
    return dbError(e);
  }
}
