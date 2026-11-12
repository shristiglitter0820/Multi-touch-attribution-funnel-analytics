import { guard } from "@/lib/auth";
import { withUser, dbError } from "@/lib/db";

// Dropdown data: channels + this advertiser's campaigns
export async function GET() {
  const user = await guard();
  if (user instanceof Response) return user;
  try {
    const out = await withUser(user, async (c) => {
      const ch = await c.query("SELECT channel_id, channel_name FROM channel ORDER BY channel_id");
      const ca = await c.query("SELECT campaign_id, name, status FROM campaign WHERE advertiser_id = $1 ORDER BY campaign_id", [user.advertiserId]);
      return { channels: ch.rows, campaigns: ca.rows };
    });
    return Response.json(out);
  } catch (e) {
    return dbError(e);
  }
}
