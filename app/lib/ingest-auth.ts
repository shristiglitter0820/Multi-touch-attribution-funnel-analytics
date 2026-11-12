import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Machine-to-machine authentication for the ad-event endpoints.
 * Callers send the key in the `x-api-key` header; the expected value is INGEST_API_KEY (environment variable, never in code).
 * 'not_configured' means the server has no key set: the endpoint then refuses everyone (fail closed).
 */
export function checkApiKey(req: Request): "ok" | "invalid" | "not_configured" {
  const expected = process.env.INGEST_API_KEY;
  if (!expected || expected.length < 16) return "not_configured";
  const given = req.headers.get("x-api-key") ?? "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b) ? "ok" : "invalid";
}
