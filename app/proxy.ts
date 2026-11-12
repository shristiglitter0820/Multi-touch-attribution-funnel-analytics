// Next.js 16 "proxy" (formerly middleware): gate pages and APIs on a valid signed session.
// Layer 1 of 4:  proxy (session + coarse role gate for /admin and /api/admin)
// Layer 2:       guard() inside every route handler / admin page
// Layer 3:       PostgreSQL roles via SET LOCAL ROLE in withUser()
// Layer 4:       procedure-level role checks (sp_update_campaign_budget, ...)
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, verifyToken } from "@/lib/jwt";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE)?.value;
  const user = token ? await verifyToken(token) : null;
  const isApi = pathname.startsWith("/api/");

  // Member 1's event endpoints are called by machines, so they are not behind the browser session:
  //  - /api/health        public status check (no data)
  //  - /api/events        x-api-key is verified inside the handler (fails closed if INGEST_API_KEY is unset)
  //  - /api/events/sync   ADMIN session OR an x-api-key header (verified inside the handler)
  if (pathname === "/api/health" || pathname === "/api/events") return NextResponse.next();
  if (pathname === "/api/events/sync") {
    if (user?.role === "ADMIN" || req.headers.has("x-api-key")) return NextResponse.next();
    return NextResponse.json({ error: user ? "Forbidden for your role" : "Not authenticated" }, { status: user ? 403 : 401 });
  }

  if (!user) {
    if (isApi) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const adminArea = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  if (adminArea && user.role !== "ADMIN") {
    if (isApi) return NextResponse.json({ error: "Forbidden for your role" }, { status: 403 });
    return NextResponse.redirect(new URL("/dashboard?denied=1", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // everything except the login page, the login API and static assets
  matcher: ["/dashboard/:path*", "/admin/:path*", "/api/((?!auth/login).*)"],
};
