// Replaces Member 1's `GET /` health check (the site root now redirects to the dashboard).
// Public on purpose; reports component status without exposing any data.
import { pool } from "@/lib/db";
import { getMongoClient } from "@/lib/mongo";

export async function GET() {
  const status = { message: "AdTech Attribution API is running!", postgres: "ok", mongodb: "ok" };
  try { await pool.query("SELECT 1"); } catch { status.postgres = "unavailable"; }
  try { await (await getMongoClient()).db("admin").command({ ping: 1 }); } catch { status.mongodb = "unavailable"; }
  return Response.json(status, { status: status.postgres === "ok" ? 200 : 503 });
}
