import { z } from "zod";
import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

const Query = z.object({ campaign_id: z.coerce.number().int().positive().optional() });

// GET /api/analytics/attribution?campaign_id=   (ADMIN + ANALYST): credited conversions and revenue per channel and model
export async function GET(req: Request) {
  const user = await guard();
  if (user instanceof Response) return user;
  const sp = new URL(req.url).searchParams;
  const q = Query.safeParse({ campaign_id: sp.get("campaign_id") || undefined });
  if (!q.success) return Response.json({ error: "campaign_id must be a positive integer" }, { status: 400 });
  try {
    const rows = await withUser(user, async (c) => {
      const params: unknown[] = [user.advertiserId];
      let where = "advertiser_id = $1";
      if (q.data.campaign_id) { params.push(q.data.campaign_id); where += " AND campaign_id = $2"; }
      return (await c.query(`SELECT campaign_id, campaign_name, channel_name, model_name, credited_conversions, attributed_revenue
                             FROM v_attribution_by_channel WHERE ${where} ORDER BY campaign_id, channel_name, model_name`, params)).rows;
    });
    return Response.json(rows.map((r) => ({ ...r, credited_conversions: Number(r.credited_conversions), attributed_revenue: Number(r.attributed_revenue) })));
  } catch (e) {
    return dbError(e);
  }
}
