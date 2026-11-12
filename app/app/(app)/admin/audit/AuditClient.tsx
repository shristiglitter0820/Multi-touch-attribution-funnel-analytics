"use client";
import { useState } from "react";
import { Alert, Badge, Button, EmptyState, Field, fmtDate, fmtDateTime, fmtMoney, Input, LoadingState, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/useApi";

type Audit = { audit_id: number; campaign_id: number; campaign_name: string; action: "INSERT" | "UPDATE"; changed_by_name: string | null; changed_at: string; changes: Record<string, unknown> };
type Resp = { total: number; rows: Audit[]; limit: number; offset: number };
type Lookups = { campaigns: { campaign_id: number; name: string }[] };

const LABEL: Record<string, string> = { name: "Name", objective: "Objective", total_budget: "Budget", start_date: "Start date", end_date: "End date", status: "Status" };
const PAGE = 15;

function show(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "(empty)";
  if (key === "total_budget") return fmtMoney(Number(v));
  if (key === "start_date" || key === "end_date") return fmtDate(String(v));
  return String(v);
}

function Changes({ a }: { a: Audit }) {
  if (a.action === "INSERT") {
    return <ul className="space-y-0.5">{Object.keys(LABEL).map((k) => <li key={k}><span className="text-ink-2">{LABEL[k]}:</span> {show(k, a.changes[k])}</li>)}</ul>;
  }
  const keys = Object.keys(a.changes).filter((k) => k in LABEL);
  if (keys.length === 0) return <span className="text-ink-3">No visible field changes</span>;
  return (
    <ul className="space-y-0.5">
      {keys.map((k) => {
        const c = a.changes[k] as { old: unknown; new: unknown };
        return <li key={k}><span className="text-ink-2">{LABEL[k]}:</span> {show(k, c.old)} <span aria-label="changed to">→</span> <strong>{show(k, c.new)}</strong></li>;
      })}
    </ul>
  );
}

export function AuditClient() {
  const [campaign, setCampaign] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const lookQ = useApi<Lookups>("/api/lookups");

  const rangeError = from && to && from > to ? "'To' must not be before 'From'." : null;
  const qs = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
  if (campaign) qs.set("campaign_id", campaign);
  if (action) qs.set("action", action);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const q = useApi<Resp>(rangeError ? null : `/api/admin/audit?${qs}`);
  const rows = q.data?.rows ?? [];
  const total = q.data?.total ?? 0;
  const reset = (fn: (v: string) => void) => (v: string) => { fn(v); setOffset(0); };

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every campaign creation and change, with who made it and when. Recorded automatically by a database trigger." />
      <div className="mb-5 grid gap-4 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Campaign" htmlFor="au-campaign">
          <Select id="au-campaign" value={campaign} onChange={(e) => reset(setCampaign)(e.target.value)}>
            <option value="">All campaigns</option>
            {(lookQ.data?.campaigns ?? []).map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Action" htmlFor="au-action">
          <Select id="au-action" value={action} onChange={(e) => reset(setAction)(e.target.value)}>
            <option value="">All actions</option><option value="INSERT">Created</option><option value="UPDATE">Updated</option>
          </Select>
        </Field>
        <Field label="From" htmlFor="au-from"><Input id="au-from" type="date" value={from} onChange={(e) => reset(setFrom)(e.target.value)} /></Field>
        <Field label="To" htmlFor="au-to"><Input id="au-to" type="date" value={to} onChange={(e) => reset(setTo)(e.target.value)} /></Field>
      </div>
      {rangeError && <div className="mb-4"><Alert tone="error">{rangeError}</Alert></div>}

      {q.loading && <LoadingState label="Loading audit log..." />}
      {q.error && <Alert tone="error">Could not load the audit log: {q.error}</Alert>}
      {q.data && rows.length === 0 && (campaign || action || from || to
        ? <EmptyState title="No audit entries match these filters" hint="Try clearing or widening the filters." />
        : <EmptyState title="No changes recorded yet" hint="Entries appear here whenever a campaign is created or edited (name, budget, dates, status)." />)}
      {rows.length > 0 && (
        <>
          <Table caption="Campaign audit log">
            <thead><tr><Th>When</Th><Th>Campaign</Th><Th>Action</Th><Th>Changed by</Th><Th>Changes</Th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.audit_id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(a.changed_at)}</Td>
                  <Td className="font-semibold">{a.campaign_name}</Td>
                  <Td><Badge tone={a.action === "INSERT" ? "ok" : "info"}>{a.action === "INSERT" ? "Created" : "Updated"}</Badge></Td>
                  <Td>{a.changed_by_name ?? <span className="text-ink-3">System / pipeline</span>}</Td>
                  <Td><Changes a={a} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-2">Showing {offset + 1}–{offset + rows.length} of {total}</p>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
              <Button variant="secondary" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
