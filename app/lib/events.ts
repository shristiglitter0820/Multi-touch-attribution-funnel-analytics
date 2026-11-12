// Event validation, ported from Member 1's Express server (src/server.js) with the same rules and messages.
// Additions (marked "new") only protect database column limits so one malformed event cannot poison a sync.
export const ALLOWED_EVENT_TYPES = ["IMPRESSION", "CLICK", "VISIT", "ADD_TO_CART", "PURCHASE"] as const;
export type EventType = (typeof ALLOWED_EVENT_TYPES)[number];

export interface EventInput {
  user_id: number;
  event_type: EventType;
  channel: string;
  ad_id: number | null;
  device_type: string | null;
  revenue: number | null;
  order_reference: string | null;
  session_id: number | null;
}
export type Validation = { ok: true; event: EventInput } | { ok: false; status: number; body: Record<string, unknown> };

const fail = (error: string, extra: Record<string, unknown> = {}): Validation => ({ ok: false, status: 400, body: { error, ...extra } });
const isPosInt = (v: unknown, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= max;
export const MAX_REVENUE = 9_999_999_999.99; // numeric(12,2)

export function validateEvent(body: unknown): Validation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return fail("Request body must be a JSON object");
  const b = body as Record<string, unknown>;

  if (!isPosInt(b.user_id)) return fail("user_id must be a positive integer");
  if (typeof b.event_type !== "string" || !(ALLOWED_EVENT_TYPES as readonly string[]).includes(b.event_type)) {
    return fail("Invalid event_type", { allowed: ALLOWED_EVENT_TYPES });
  }
  const channel = typeof b.channel === "string" ? b.channel.trim() : "";
  if (!channel) return fail("channel is required");
  if (channel.length > 50) return fail("channel must be at most 50 characters"); // new

  let revenue: number | null = null;
  let order_reference: string | null = null;
  let session_id: number | null = null;
  if (b.event_type === "PURCHASE") {
    if (typeof b.revenue !== "number" || !Number.isFinite(b.revenue) || b.revenue < 0) return fail("revenue must be a non-negative number");
    if (b.revenue > MAX_REVENUE) return fail("revenue is too large"); // new
    revenue = b.revenue;
    const ref = typeof b.order_reference === "string" ? b.order_reference.trim() : "";
    if (!ref || ref.length > 100) return fail("order_reference is required and must be at most 100 characters");
    order_reference = ref;
    if (b.session_id !== undefined && b.session_id !== null) {
      if (!isPosInt(b.session_id)) return fail("session_id must be a positive integer");
      session_id = b.session_id;
    }
  }

  let ad_id: number | null = null;
  if (b.ad_id !== undefined && b.ad_id !== null) {
    if (!isPosInt(b.ad_id, 2_147_483_647)) return fail("ad_id must be a positive integer"); // upper bound is new (INT column)
    ad_id = b.ad_id;
  }
  let device_type: string | null = null;
  if (b.device_type !== undefined && b.device_type !== null) {
    if (typeof b.device_type !== "string") return fail("device_type must be a string");
    if (b.device_type.length > 30) return fail("device_type must be at most 30 characters"); // new
    device_type = b.device_type;
  }
  return { ok: true, event: { user_id: b.user_id, event_type: b.event_type as EventType, channel, ad_id, device_type, revenue, order_reference, session_id } };
}

/** Row for the staged_event table, built from a document read back from MongoDB; null = malformed document (skipped and counted). */
export interface StagedRow {
  mongo_event_id: string; event_type: string; external_user_id: number; channel_name: string; ad_id: number | null;
  device_type: string | null; event_time: string; revenue: number | null; order_reference: string | null; session_hint: number | null;
}
export function toStagedRow(doc: Record<string, unknown>): StagedRow | null {
  const id = String(doc._id ?? "");
  if (!id || id.length > 24) return null;
  const v = validateEvent(doc);
  if (!v.ok) return null;
  const t = doc.event_time instanceof Date ? doc.event_time : doc.received_at instanceof Date ? doc.received_at : new Date(String(doc.event_time ?? ""));
  if (Number.isNaN(t.getTime())) return null;
  const e = v.event;
  return { mongo_event_id: id, event_type: e.event_type, external_user_id: e.user_id, channel_name: e.channel, ad_id: e.ad_id,
           device_type: e.device_type, event_time: t.toISOString(), revenue: e.revenue, order_reference: e.order_reference, session_hint: e.session_id };
}
