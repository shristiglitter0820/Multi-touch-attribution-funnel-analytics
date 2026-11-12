import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";
import { campaignUpdate, parseBody } from "@/lib/validation";

const COLUMNS = ["name", "objective", "start_date", "end_date", "status"] as const;

// PATCH /api/admin/campaigns/1  (ADMIN only)
//  - plain fields: UPDATE campaign (audit trigger logs the change)
//  - total_budget: goes through sp_update_campaign_budget (role check + row lock + budget-guard trigger)
//  - everything runs in ONE transaction: if the budget is rejected nothing else is saved.
//  - campaigns are never deleted: set status = 'ENDED'.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return Response.json({ error: "Invalid campaign id" }, { status: 400 });
  const p = await parseBody(req, campaignUpdate);
  if ("error" in p) return p.error;
  const d = p.data;

  try {
    const found = await withUser(user, async (c) => {
      const cur = await c.query("SELECT total_budget FROM campaign WHERE campaign_id = $1 AND advertiser_id = $2 FOR UPDATE", [id, user.advertiserId]);
      if (cur.rowCount === 0) return false;

      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const col of COLUMNS) {
        if (col in d) { vals.push((d as Record<string, unknown>)[col] ?? null); sets.push(`${col} = $${vals.length}`); }
      }
      if (sets.length) {
        vals.push(id);
        await c.query(`UPDATE campaign SET ${sets.join(", ")} WHERE campaign_id = $${vals.length}`, vals);
      }
      if (d.total_budget !== undefined && Number(cur.rows[0].total_budget) !== d.total_budget) {
        await c.query("CALL sp_update_campaign_budget($1, $2, $3)", [id, d.total_budget, user.userId]);
      }
      return true;
    });
    if (!found) return Response.json({ error: "Campaign not found" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "23514" && !err.message?.startsWith("Budget")) {
      return Response.json({ error: "Rejected by a database rule: the end date must be on or after the start date." }, { status: 400 });
    }
    return dbError(e, { "23505": "A campaign with this name already exists." });
  }
}
