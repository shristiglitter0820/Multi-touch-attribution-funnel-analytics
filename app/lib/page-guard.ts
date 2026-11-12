import { redirect } from "next/navigation";
import { getSession } from "./auth";
import type { Role, SessionUser } from "./jwt";

/** Server-side page guard: unauthenticated -> /login, wrong role -> /dashboard?denied=1 */
export async function requirePage(role?: Role): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect("/dashboard?denied=1");
  return user;
}
