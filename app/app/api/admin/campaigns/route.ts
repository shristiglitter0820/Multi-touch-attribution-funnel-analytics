import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";
import { campaignCreate, parseBody } from "@/lib/validation";

const SELECT = `SELECT c.campaign_id, c.name, c.objective, c.total_budget, b.spent, c.status,
                       to_char(c.start_date, 'YYYY-MM-DD') AS start_date, to_char(c.end_date, 'YYYY-MM-DD') AS end_date, c.created_at
                FROM campaign c JOIN v_campaign_budget_status b ON b.campaign_id = c.campaign_id`;
const shape = (r: Record<string, unknown>) => ({ ...r, total_budget: Number(r.total_budget), spent: Number(r.spent) });

// GET /api/admin/campaigns  -> full campaign list (ADMIN only)
export async function GET() {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  try {
    const rows = await withUser(user, async (c) =>
      (await c.query(`${SELECT} WHERE c.advertiser_id = $1 ORDER BY c.campaign_id`, [user.advertiserId])).rows);
    return Response.json(rows.map(shape));
  } catch (e) {
    return dbError(e);
  }
}

// POST /api/admin/campaigns  -> create (the audit trigger records an INSERT with the acting user)
export async function POST(req: Request) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const p = await parseBody(req, campaignCreate);
  if ("error" in p) return p.error;
  const d = p.data;
  try {
    const row = await withUser(user, async (c) => {
      const ins = await c.query(
        `INSERT INTO campaign (advertiser_id, created_by, name, objective, total_budget, start_date, end_date, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING campaign_id`,
        [user.advertiserId, user.userId, d.name, d.objective ?? null, d.total_budget, d.start_date, d.end_date, d.status]
      );
      return (await c.query(`${SELECT} WHERE c.campaign_id = $1`, [ins.rows[0].campaign_id])).rows[0];
    });
    return Response.json(shape(row), { status: 201 });
  } catch (e) {
    return dbError(e, { "23505": "A campaign with this name already exists.", "23514": "Rejected by a database rule: budget must be above 0 and the end date on or after the start date." });
  }
}
