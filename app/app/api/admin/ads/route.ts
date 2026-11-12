import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";
import { adCreate, parseBody } from "@/lib/validation";

const SELECT = `SELECT a.ad_id, a.campaign_id, c.name AS campaign_name, a.channel_id, ch.channel_name, a.ad_name, a.ad_format,
                       a.pricing_model, a.unit_cost, a.status,
                       (SELECT COUNT(*) FROM touchpoint t WHERE t.ad_id = a.ad_id) AS tracked_events
                FROM ad a JOIN campaign c ON c.campaign_id = a.campaign_id JOIN channel ch ON ch.channel_id = a.channel_id`;
const shape = (r: Record<string, unknown>) => ({ ...r, unit_cost: Number(r.unit_cost), tracked_events: Number(r.tracked_events) });

export async function GET(req: Request) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const campaign = Number(new URL(req.url).searchParams.get("campaign_id"));
  try {
    const rows = await withUser(user, async (c) => {
      const params: unknown[] = [user.advertiserId];
      let where = "WHERE c.advertiser_id = $1";
      if (Number.isInteger(campaign) && campaign > 0) { params.push(campaign); where += ` AND a.campaign_id = $2`; }
      return (await c.query(`${SELECT} ${where} ORDER BY a.ad_id`, params)).rows;
    });
    return Response.json(rows.map(shape));
  } catch (e) {
    return dbError(e);
  }
}

export async function POST(req: Request) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const p = await parseBody(req, adCreate);
  if ("error" in p) return p.error;
  const d = p.data;
  try {
    const row = await withUser(user, async (c) => {
      const own = await c.query("SELECT 1 FROM campaign WHERE campaign_id = $1 AND advertiser_id = $2", [d.campaign_id, user.advertiserId]);
      if (own.rowCount === 0) return null;
      const ins = await c.query(
        `INSERT INTO ad (campaign_id, channel_id, ad_name, ad_format, pricing_model, unit_cost, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ad_id`,
        [d.campaign_id, d.channel_id, d.ad_name, d.ad_format ?? null, d.pricing_model, d.unit_cost, d.status]
      );
      return (await c.query(`${SELECT} WHERE a.ad_id = $1`, [ins.rows[0].ad_id])).rows[0];
    });
    if (!row) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return Response.json(shape(row), { status: 201 });
  } catch (e) {
    return dbError(e, { "23503": "The selected channel does not exist.", "23514": "Rejected by a database rule (check the pricing model and unit cost)." });
  }
}
