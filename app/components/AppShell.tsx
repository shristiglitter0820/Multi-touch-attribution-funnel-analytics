"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "./ui";

type User = { name: string; role: "ADMIN" | "ANALYST" };
const LINKS = [
  { href: "/dashboard", label: "Dashboard", admin: false },
  { href: "/attribution", label: "Attribution", admin: false },
  { href: "/admin/campaigns", label: "Campaigns", admin: true },
  { href: "/admin/ads", label: "Ads", admin: true },
  { href: "/admin/events", label: "Events", admin: true },
  { href: "/admin/audit", label: "Audit log", admin: true },
];

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-ink">
        Skip to content
      </a>
      <header className="on-dark bg-nav text-on-dark">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight text-on-dark">Ad Attribution Engine</Link>
          <nav aria-label="Main" className="order-3 flex w-full flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
            {LINKS.filter((l) => !l.admin || user.role === "ADMIN").map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + "/");
              return (
                <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
                  className={cn("rounded-md px-3 py-2 text-sm font-semibold",
                    active ? "bg-nav-2 text-on-dark underline decoration-2 underline-offset-8" : "text-on-dark-2 hover:bg-nav-2 hover:text-on-dark")}>
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="rounded-md bg-nav-2 px-3 py-1.5 text-sm text-on-dark">
              {user.name} <span className="ml-1 rounded bg-on-dark px-1.5 py-0.5 text-xs font-bold text-nav">{user.role}</span>
            </span>
            <button onClick={logout} className="min-h-10 rounded-md border border-on-dark-2 px-3 py-1.5 text-sm font-semibold text-on-dark hover:bg-nav-2">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
