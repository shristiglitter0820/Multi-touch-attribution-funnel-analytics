"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) { router.push("/dashboard"); router.refresh(); }
    else setError((await res.json().catch(() => ({}))).error ?? "Login failed");
  }

  return (
    <main className="on-dark flex min-h-screen flex-col items-center justify-center bg-nav px-4 py-10">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-on-dark">Ad Attribution Engine</h1>
        <p className="mt-2 text-base text-on-dark-2">Multi-touch attribution &amp; funnel analytics for ad campaigns</p>
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-surface p-8 text-ink shadow-xl">
        <h2 className="text-xl font-semibold text-ink">Sign in</h2>
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Signing in..." : "Sign in"}</Button>
      </form>
    </main>
  );
}
