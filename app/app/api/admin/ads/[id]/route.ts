import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";
import { adUpdate, parseBody } from "@/lib/validation";

const COLUMNS = ["channel_id", "ad_name", "ad_format", "pricing_model", "unit_cost", "status"] as const;

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Invalid ad id" }, { status: 400 });
  const p = await parseBody(req, adUpdate);
  if ("error" in p) return p.error;
  const d = p.data as Record<string, unknown>;
  try {
    const ok = await withUser(user, async (c) => {
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const col of COLUMNS) if (col in d) { vals.push(d[col] ?? null); sets.push(`${col} = $${vals.length}`); }
      vals.push(id, user.advertiserId);
      const r = await c.query(
        `UPDATE ad SET ${sets.join(", ")} FROM campaign c
         WHERE ad.ad_id = $${vals.length - 1} AND c.campaign_id = ad.campaign_id AND c.advertiser_id = $${vals.length}
         RETURNING ad.ad_id`, vals);
      return r.rowCount === 1;
    });
    if (!ok) return Response.json({ error: "Ad not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e, { "23503": "The selected channel does not exist." });
  }
}

// DELETE /api/admin/ads/1  -> SQL DELETE on ad.
// touchpoint.ad_id is ON DELETE SET NULL, but touchpoint has CHECK (IMPRESSION/CLICK rows need an ad_id),
// so an ad with recorded impressions/clicks is protected by the database: the DELETE fails with 23514.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Invalid ad id" }, { status: 400 });
  try {
    const ok = await withUser(user, async (c) => {
      const r = await c.query(
        `DELETE FROM ad USING campaign c
         WHERE ad.ad_id = $1 AND c.campaign_id = ad.campaign_id AND c.advertiser_id = $2 RETURNING ad.ad_id`,
        [id, user.advertiserId]);
      return r.rowCount === 1;
    });
    if (!ok) return Response.json({ error: "Ad not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e, { "23514": "This ad has recorded impressions or clicks, so it cannot be deleted. Set its status to PAUSED instead." });
  }
}
