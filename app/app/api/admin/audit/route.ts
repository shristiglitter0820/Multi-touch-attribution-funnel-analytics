import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";
import { auditQuery } from "@/lib/validation";

// GET /api/admin/audit?campaign_id=&action=INSERT|UPDATE&from=&to=&limit=&offset=   (ADMIN only; view v_campaign_audit)
export async function GET(req: Request) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const sp = new URL(req.url).searchParams;
  const q = auditQuery.safeParse(Object.fromEntries([...sp.entries()].filter(([, v]) => v !== "")));
  if (!q.success) return Response.json({ error: q.error.issues[0].message }, { status: 400 });
  const { campaign_id, action, from, to, limit, offset } = q.data;

  const params: unknown[] = [user.advertiserId];
  const where = ["advertiser_id = $1"];
  if (campaign_id) { params.push(campaign_id); where.push(`campaign_id = $${params.length}`); }
  if (action) { params.push(action); where.push(`action = $${params.length}`); }
  if (from) { params.push(from); where.push(`changed_at >= $${params.length}::date`); }
  if (to) { params.push(to); where.push(`changed_at < ($${params.length}::date + 1)`); }
  const W = where.join(" AND ");

  try {
    const out = await withUser(user, async (c) => {
      const total = await c.query(`SELECT COUNT(*)::int AS n FROM v_campaign_audit WHERE ${W}`, params);
      const rows = await c.query(
        `SELECT audit_id, campaign_id, campaign_name, action, changed_by_name, changed_at, changes
         FROM v_campaign_audit WHERE ${W} ORDER BY changed_at DESC, audit_id DESC LIMIT ${limit} OFFSET ${offset}`, params);
      return { total: total.rows[0].n as number, rows: rows.rows };
    });
    return Response.json({ ...out, limit, offset });
  } catch (e) {
    return dbError(e);
  }
}
