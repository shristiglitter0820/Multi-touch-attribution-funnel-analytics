import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

// POST /api/snapshot -> sp_build_funnel_snapshot(current_date): cumulative funnel through today, upserted (ADMIN only)
export async function POST() {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  try {
    const date = await withUser(user, async (c) => {
      await c.query("CALL sp_build_funnel_snapshot(current_date)");
      const r = await c.query("SELECT to_char(current_date, 'YYYY-MM-DD') AS d");
      return r.rows[0].d as string;
    });
    return Response.json({ ok: true, snapshot_date: date });
  } catch (e) {
    return dbError(e);
  }
}
