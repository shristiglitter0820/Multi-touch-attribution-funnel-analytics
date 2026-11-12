import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "@/lib/db";
import { COOKIE, signToken, type Role } from "@/lib/jwt";

const Body = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
// compared against when the email is unknown, so timing does not reveal valid emails
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8.HnnW7qHtUFR0vOQpMF0Pq3dLQe0a";

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });
  const { email, password } = parsed.data;

  const { rows } = await pool.query(
    "SELECT user_id, advertiser_id, full_name, password_hash, role FROM app_user WHERE email = $1 AND is_active",
    [email.toLowerCase()]
  );
  const u = rows[0];
  const ok = await bcrypt.compare(password, u?.password_hash ?? DUMMY_HASH);
  if (!u || !ok) return Response.json({ error: "Invalid email or password" }, { status: 401 });

  const token = await signToken({
    userId: u.user_id,
    role: u.role as Role,
    advertiserId: u.advertiser_id,
    name: u.full_name,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return Response.json({ name: u.full_name, role: u.role });
}
