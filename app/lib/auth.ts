import { cookies } from "next/headers";
import { COOKIE, verifyToken, type Role, type SessionUser } from "./jwt";

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  return token ? verifyToken(token) : null;
}

/** Use in route handlers:  const user = await guard(["ADMIN"]); if (user instanceof Response) return user; */
export async function guard(roles?: Role[]): Promise<SessionUser | Response> {
  const user = await getSession();
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  if (roles && !roles.includes(user.role)) {
    return Response.json({ error: "Forbidden for your role" }, { status: 403 });
  }
  return user;
}
