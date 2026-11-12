// Server-side validation schemas (Zod). Database CHECK / UNIQUE / FK constraints remain the last line of defence.
import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)), "Not a valid date");
const money = (max: number) => z.number({ error: "Enter a number" }).positive("Must be greater than 0").max(max, "Value is too large")
  .refine((n) => Math.abs(Math.round(n * 100) / 100 - n) < 1e-9, "At most 2 decimal places");
const optionalText = (max: number) =>
  z.string().trim().max(max, `At most ${max} characters`).transform((v) => (v === "" ? null : v)).nullable().optional();

export const CAMPAIGN_STATUS = ["DRAFT", "ACTIVE", "PAUSED", "ENDED"] as const;

export const campaignCreate = z.object({
  name: z.string().trim().min(3, "At least 3 characters").max(120, "At most 120 characters"),
  objective: optionalText(40),
  total_budget: money(1_000_000_000),
  start_date: isoDate,
  end_date: isoDate,
  status: z.enum(CAMPAIGN_STATUS).default("DRAFT"),
}).refine((c) => c.end_date >= c.start_date, { path: ["end_date"], message: "End date must be on or after the start date" });

export const campaignUpdate = z.object({
  name: z.string().trim().min(3, "At least 3 characters").max(120, "At most 120 characters").optional(),
  objective: optionalText(40),
  total_budget: money(1_000_000_000).optional(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
  status: z.enum(CAMPAIGN_STATUS).optional(),
}).refine((c) => Object.keys(c).length > 0, { message: "Nothing to update" })
  .refine((c) => !(c.start_date && c.end_date) || c.end_date >= c.start_date, { path: ["end_date"], message: "End date must be on or after the start date" });

export const AD_STATUS = ["ACTIVE", "PAUSED"] as const;
const unitCost = z.number({ error: "Enter a number" }).min(0, "Cannot be negative").max(10_000, "Value is too large")
  .refine((n) => Math.abs(Math.round(n * 10000) / 10000 - n) < 1e-9, "At most 4 decimal places");

export const adCreate = z.object({
  campaign_id: z.number().int().positive(),
  channel_id: z.number().int().positive(),
  ad_name: z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters"),
  ad_format: optionalText(30),
  pricing_model: z.enum(["CPC", "CPM"], { error: "Choose CPC or CPM" }),
  unit_cost: unitCost,
  status: z.enum(AD_STATUS).default("ACTIVE"),
});
// campaign_id is deliberately NOT editable: moving an ad would silently re-attribute its history
export const adUpdate = z.object({
  channel_id: z.number().int().positive().optional(),
  ad_name: z.string().trim().min(2, "At least 2 characters").max(120, "At most 120 characters").optional(),
  ad_format: optionalText(30),
  pricing_model: z.enum(["CPC", "CPM"]).optional(),
  unit_cost: unitCost.optional(),
  status: z.enum(AD_STATUS).optional(),
}).refine((c) => Object.keys(c).length > 0, { message: "Nothing to update" });

export const auditQuery = z.object({
  campaign_id: z.coerce.number().int().positive().optional(),
  action: z.enum(["INSERT", "UPDATE"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(25),
  offset: z.coerce.number().int().min(0).default(0),
}).refine((q) => !(q.from && q.to) || q.from <= q.to, { path: ["to"], message: "'To' must not be before 'From'" });

/** Parse JSON body with a schema; returns data or a 400 Response with per-field messages. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<{ data: z.infer<S> } | { error: Response }> {
  const raw = await req.json().catch(() => null);
  const r = schema.safeParse(raw);
  if (r.success) return { data: r.data };
  const flat = z.flattenError(r.error);
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(flat.fieldErrors)) if (v && (v as string[]).length) fields[k] = (v as string[])[0];
  const msg = flat.formErrors[0] ?? "Please correct the highlighted fields";
  return { error: Response.json({ error: msg, fields }, { status: 400 }) };
}
