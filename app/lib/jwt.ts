// Edge-safe JWT helpers (also imported by proxy.ts)
import { SignJWT, jwtVerify } from "jose";

export type Role = "ADMIN" | "ANALYST";
export interface SessionUser {
  userId: number;
  role: Role;
  advertiserId: number;
  name: string;
}
export const COOKIE = "adtech_session";

function key() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (>= 32 characters)");
  return new TextEncoder().encode(s);
}

export async function signToken(u: SessionUser) {
  return new SignJWT({ ...u })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(key());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    return {
      userId: Number(payload.userId),
      role: payload.role as Role,
      advertiserId: Number(payload.advertiserId),
      name: String(payload.name),
    };
  } catch {
    return null;
  }
}
