import { z } from "zod";
import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

const Body = z.object({ budget: z.number().positive().max(1_000_000_000) });

// PATCH /api/campaigns/1/budget   { "budget": 500 }   (ADMIN only)
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await guard(["ADMIN"]);
  if (user instanceof Response) return user;

  const id = Number((await ctx.params).id);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!Number.isInteger(id) || !parsed.success) {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  try {
    await withUser(user, (c) =>
      c.query("CALL sp_update_campaign_budget($1, $2, $3)", [id, parsed.data.budget, user.userId])
    );
    return Response.json({ ok: true });
  } catch (e) {
    return dbError(e);
  }
}
