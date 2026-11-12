"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, Field, fmtDate, fmtMoney, fmtNumber, Input, LoadingState, PageHeader, ProgressBar, StatusBadge, Table, Td, Th, type Tone } from "@/components/ui";
import { BudgetChart, DropoffChart, FunnelChart, type StageRow } from "@/components/charts";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type Campaign = {
  campaign_id: number; name: string; status: string; total_budget: number; spent: number; pct_used: number;
  from_stage: string | null; to_stage: string | null; worst_dropoff_pct: number | null; snapshot_date: string | null;
};
type Funnel = { source: "live" | "snapshot"; snapshot_date: string | null; stages: StageRow[] };
type Notice = { tone: Tone; text: string } | null;

export function DashboardClient({ role, denied }: { role: "ADMIN" | "ANALYST"; denied: boolean }) {
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [source, setSource] = useState<"live" | "snapshot">("live");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [budget, setBudget] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);

  const campaignsQ = useApi<Campaign[]>("/api/campaigns", reload);
  const campaigns = campaignsQ.data ?? [];
  const selectedId = picked ?? campaigns[0]?.campaign_id ?? null;
  const current = campaigns.find((c) => c.campaign_id === selectedId);

  const rangeError = source === "live" && from && to && from > to ? "'From' date must not be after 'To' date." : null;
  const qs = new URLSearchParams({ source });
  if (source === "live") { if (from) qs.set("from", from); if (to) qs.set("to", to); }
  const funnelQ = useApi<Funnel>(selectedId && !rangeError ? `/api/campaigns/${selectedId}/funnel?${qs}` : null, reload);
  const stages = funnelQ.data?.stages ?? [];

  // largest drop-off AFTER the click stage (impression -> click is always the steepest step)
  const onSite = stages.filter((s) => s.order >= 3 && stages[s.order - 2]?.visitors > 0).sort((a, b) => b.dropoff_pct - a.dropoff_pct)[0];

  const totals = {
    active: campaigns.filter((c) => c.status === "ACTIVE").length,
    budget: campaigns.reduce((a, c) => a + c.total_budget, 0),
    spent: campaigns.reduce((a, c) => a + c.spent, 0),
  };

  async function saveBudget() {
    if (!current) return;
    setNotice(null); setBusy(true);
    try {
      await api(`/api/campaigns/${current.campaign_id}/budget`, { method: "PATCH", body: JSON.stringify({ budget: Number(budget) }) });
      setNotice({ tone: "success", text: `Budget for "${current.name}" updated to ${fmtMoney(Number(budget))}.` });
      setBudget(""); setReload((r) => r + 1);
    } catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
    setBusy(false);
  }

  async function refreshSnapshots() {
    setNotice(null); setBusy(true);
    try {
      const r = await api<{ snapshot_date: string }>("/api/snapshot", { method: "POST" });
      setNotice({ tone: "success", text: `Funnel snapshots rebuilt through ${fmtDate(r.snapshot_date)}. Snapshots are cumulative, so the stored counts for that date were replaced. Choose "Latest snapshot" to view them.` });
      setReload((n) => n + 1);
    } catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        title="Campaign funnel analytics"
        subtitle="Budget status and the impression → click → visit → cart → purchase funnel for your campaigns."
        actions={role === "ADMIN" && (
          <Button variant="secondary" onClick={refreshSnapshots} disabled={busy}>{busy ? "Working..." : "Refresh snapshots"}</Button>
        )}
      />

      <div className="mb-6 space-y-3" aria-live="polite">
        {denied && <Alert tone="warning">You do not have access to that page. Admin pages require the ADMIN role.</Alert>}
        {notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      </div>

      {campaignsQ.loading && <LoadingState label="Loading campaigns..." />}
      {campaignsQ.error && <Alert tone="error">Could not load campaigns: {campaignsQ.error}</Alert>}
      {!campaignsQ.loading && !campaignsQ.error && campaigns.length === 0 && (
        <EmptyState title="No campaigns yet" hint="Campaigns appear here once an Admin creates them."
          action={role === "ADMIN" ? <Link href="/admin/campaigns" className="font-semibold text-brand underline">Create a campaign</Link> : undefined} />
      )}

      {campaigns.length > 0 && (
        <>
          <section aria-label="Summary" className="mb-6 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Active campaigns", value: `${totals.active} of ${campaigns.length}` },
              { label: "Total budget", value: fmtMoney(totals.budget) },
              { label: "Total spent", value: `${fmtMoney(totals.spent)} (${totals.budget ? Math.round((100 * totals.spent) / totals.budget) : 0}%)` },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <p className="text-sm font-semibold text-ink-2">{k.label}</p>
                <p className="mt-1 text-2xl font-bold text-ink">{k.value}</p>
              </div>
            ))}
          </section>

          <div className="mb-6 grid gap-6 lg:grid-cols-5">
            <Card title="Campaigns" description="Select a campaign to analyse its funnel." className="lg:col-span-2">
              <ul className="space-y-3">
                {campaigns.map((c) => (
                  <li key={c.campaign_id}>
                    <button onClick={() => { setPicked(c.campaign_id); setBudget(""); }} aria-pressed={c.campaign_id === selectedId}
                      className={`w-full rounded-lg border p-4 text-left ${c.campaign_id === selectedId ? "border-2 border-brand bg-brand-soft" : "border-line bg-surface hover:bg-page"}`}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-base font-semibold text-ink">{c.name}</span>
                        <StatusBadge status={c.status} />
                      </span>
                      <span className="mt-1 block text-sm text-ink-2">{fmtMoney(c.spent)} of {fmtMoney(c.total_budget)} spent ({c.pct_used}%)</span>
                      <span className="mt-2 block"><ProgressBar value={c.pct_used} label={`${c.name} budget used`} /></span>
                      <span className="mt-2 block text-sm text-ink-3">
                        {c.snapshot_date
                          ? `Snapshot ${fmtDate(c.snapshot_date)}: largest drop is ${c.from_stage} → ${c.to_stage} (${c.worst_dropoff_pct}%)`
                          : "No funnel snapshot saved yet"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Budget utilisation" description="Spent versus remaining budget per campaign." className="lg:col-span-3">
              <BudgetChart campaigns={campaigns} />
            </Card>
          </div>

          {current && (
            <Card title={`${current.name} - funnel`} description="Distinct visitors reaching each stage.">
              <div className="mb-5 flex flex-wrap items-end gap-4">
                <fieldset>
                  <legend className="mb-1 text-sm font-semibold text-ink-2">Data source</legend>
                  <div className="flex gap-2">
                    <Button variant={source === "live" ? "primary" : "secondary"} aria-pressed={source === "live"} onClick={() => setSource("live")}>Live query</Button>
                    <Button variant={source === "snapshot" ? "primary" : "secondary"} aria-pressed={source === "snapshot"} onClick={() => setSource("snapshot")}>Latest snapshot</Button>
                  </div>
                </fieldset>
                <Field label="From" htmlFor="from"><Input id="from" type="date" value={from} disabled={source === "snapshot"} onChange={(e) => setFrom(e.target.value)} /></Field>
                <Field label="To" htmlFor="to"><Input id="to" type="date" value={to} disabled={source === "snapshot"} onChange={(e) => setTo(e.target.value)} /></Field>
                <Button variant="secondary" disabled={source === "snapshot" || (!from && !to)} onClick={() => { setFrom(""); setTo(""); }}>Clear dates</Button>
              </div>
              {source === "snapshot" && (
                <p className="mb-4 text-sm text-ink-3">Snapshots are cumulative through their snapshot date, so the date filters apply to the live query only.</p>
              )}
              {rangeError && <div className="mb-4"><Alert tone="error">{rangeError}</Alert></div>}

              {funnelQ.loading && <LoadingState label="Loading funnel..." />}
              {funnelQ.error && (
                <div className="space-y-3">
                  <Alert tone="error">Could not load the funnel: {funnelQ.error}</Alert>
                  <Button variant="secondary" onClick={() => setReload((r) => r + 1)}>Try again</Button>
                </div>
              )}
              {funnelQ.data && stages.length === 0 && (
                <EmptyState title="No snapshot saved for this campaign yet"
                  hint={role === "ADMIN" ? "Use “Refresh snapshots” at the top of the page to build one, or switch to the live query." : "Ask an Admin to refresh snapshots, or switch to the live query."} />
              )}
              {funnelQ.data && stages.length > 0 && stages[0].visitors === 0 && (
                <EmptyState title="No tracked activity in this period" hint="No impressions were recorded for this campaign in the selected date range." />
              )}
              {funnelQ.data && stages.length > 0 && stages[0].visitors > 0 && (
                <div className="space-y-6">
                  <p className="text-sm text-ink-2">
                    {funnelQ.data.source === "snapshot"
                      ? `Showing the stored snapshot from ${fmtDate(funnelQ.data.snapshot_date)}.`
                      : `Showing the live query${from || to ? ` for ${from ? fmtDate(from) : "the start"} to ${to ? fmtDate(to) : "today"}` : " for all time"}.`}
                  </p>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <div><h3 className="mb-2 text-base font-semibold text-ink">Visitors per stage</h3><FunnelChart stages={stages} /></div>
                    <div><h3 className="mb-2 text-base font-semibold text-ink">Drop-off between stages</h3><DropoffChart stages={stages} /></div>
                  </div>
                  <Table caption="Funnel stages with visitors, conversion and drop-off">
                    <thead><tr><Th>Stage</Th><Th className="text-right">Visitors</Th><Th className="text-right">% of previous stage</Th><Th className="text-right">Drop-off</Th><Th className="text-right">% of impressions</Th></tr></thead>
                    <tbody>
                      {stages.map((s) => (
                        <tr key={s.stage}>
                          <Td className="font-semibold">{s.stage} {onSite?.stage === s.stage && <Badge tone="warn">Largest on-site drop</Badge>}</Td>
                          <Td className="text-right tabular-nums">{fmtNumber(s.visitors)}</Td>
                          <Td className="text-right tabular-nums">{s.order === 1 ? "-" : `${s.pct_of_previous}%`}</Td>
                          <Td className="text-right tabular-nums">{s.order === 1 ? "-" : `${s.dropoff_pct}%`}</Td>
                          <Td className="text-right tabular-nums">{s.pct_of_top}%</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {onSite && (
                    <Alert tone="warning">
                      Biggest on-site drop-off: {stages[onSite.order - 2].stage} → <strong>{onSite.stage}</strong>, where {onSite.dropoff_pct}% of visitors leave.
                    </Alert>
                  )}
                </div>
              )}

              <div className="mt-6 border-t border-line pt-5">
                <h3 className="mb-3 text-base font-semibold text-ink">Budget</h3>
                {role === "ADMIN" ? (
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="w-56">
                      <Field label="New total budget (USD)" htmlFor="budget" hint={`Current ${fmtMoney(current.total_budget)}; spent ${fmtMoney(current.spent)} (cannot go lower).`}>
                        <Input id="budget" type="number" min="0.01" step="0.01" inputMode="decimal" placeholder="Enter new amount" value={budget} onChange={(e) => setBudget(e.target.value)} />
                      </Field>
                    </div>
                    <Button onClick={saveBudget} disabled={busy || !budget}>Save budget</Button>
                  </div>
                ) : (
                  <p className="text-sm text-ink-2">Analysts have read-only access. Only Admins can change budgets.</p>
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
