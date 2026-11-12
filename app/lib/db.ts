import { Pool, type PoolClient } from "pg";
import type { SessionUser } from "./jwt";

// One pool per server process (survives hot reload in dev)
const g = globalThis as unknown as { pgPool?: Pool };
export const pool = g.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") g.pgPool = pool;

// App role -> PostgreSQL role (fixed whitelist, never built from user input)
const DB_ROLE = { ADMIN: "adtech_admin", ANALYST: "adtech_analyst" } as const;

/**
 * Runs fn inside ONE transaction as the user's database role.
 * - SET LOCAL ROLE  : PostgreSQL itself enforces what the user may do (defence in depth)
 * - app.current_user_id : read by the audit trigger to record who made the change
 * Commits on success, rolls back on any error.
 */
export async function withUser<T>(user: SessionUser, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${DB_ROLE[user.role]}`);
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(user.userId)]);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Runs fn in ONE transaction as the least-privilege ingest role (adtech_ingest): it can stage raw events,
 * log sync runs and call fn_process_staged_events(), and nothing else. Used by the event sync endpoint only.
 */
export async function withIngest<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE adtech_ingest");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Maps PostgreSQL errors (SQLSTATE) to HTTP responses.
 * `friendly` lets a route supply a clearer message for a specific SQLSTATE.
 */
export function dbError(e: unknown, friendly: Record<string, string> = {}): Response {
  const code = (e as { code?: string }).code ?? "";
  const msg = (e as { message?: string }).message ?? "Database error";
  if (friendly[code]) {
    const status = code === "23505" || code === "23514" || code === "23503" ? 409 : code === "42501" ? 403 : 400;
    return Response.json({ error: friendly[code] }, { status });
  }
  if (code === "42501") return Response.json({ error: "Not permitted: " + msg }, { status: 403 });
  if (code === "23514" || code === "P0001") return Response.json({ error: msg }, { status: 400 });
  if (code === "23505") return Response.json({ error: "Duplicate value" }, { status: 409 });
  console.error(e);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
