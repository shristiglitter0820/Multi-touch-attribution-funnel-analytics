"use client";
import { useState } from "react";
import { Alert, Badge, Button, Card, EmptyState, fmtDateTime, fmtNumber, LoadingState, PageHeader, Table, Td, Th, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type Status = {
  counts: { PENDING?: number; PROCESSED?: number; REJECTED?: number };
  runs: { run_id: number; started_at: string; finished_at: string | null; status: string; events_ingested: number; last_event_ts: string | null }[];
  rejected: { mongo_event_id: string; event_type: string; external_user_id: string; channel_name: string; event_time: string; reject_reason: string }[];
};
type SyncResult = { total: number; synced: number; skipped: number; staged_new: number; rejected: number; malformed: number; conversions_created: number; attribution_rows: number };

export function EventsClient() {
  const [reload, setReload] = useState(0);
  const q = useApi<Status>("/api/admin/events", reload);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  async function sync() {
    setBusy(true); setNotice(null);
    try {
      const r = await api<SyncResult>("/api/events/sync", { method: "POST" });
      setNotice({ tone: r.rejected || r.malformed ? "warning" : "success",
        text: `Synchronisation finished. Read ${r.total} event(s) from MongoDB: ${r.synced} imported, ${r.rejected} rejected, ${r.malformed} malformed, ${r.skipped - r.rejected - r.malformed} already imported earlier. ${r.conversions_created} new purchase(s) and ${r.attribution_rows} attribution credit(s) created.` });
      setReload((n) => n + 1);
    } catch (e) { setNotice({ tone: "error", text: (e as Error).message }); }
    setBusy(false);
  }

  const c = q.data?.counts ?? {};
  return (
    <>
      <PageHeader title="Event synchronisation" subtitle="Raw ad events are stored in MongoDB. Synchronising turns them into visitors, sessions, funnel stages, purchases and attribution in PostgreSQL."
        actions={<Button onClick={sync} disabled={busy}>{busy ? "Synchronising..." : "Synchronise events now"}</Button>} />
      <div className="mb-4 space-y-3" aria-live="polite">{notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}</div>

      {q.loading && <LoadingState label="Loading synchronisation status..." />}
      {q.error && <Alert tone="error">Could not load synchronisation status: {q.error}</Alert>}
      {q.data && (
        <div className="space-y-6">
          <section aria-label="Event counts" className="grid gap-4 sm:grid-cols-3">
            {[{ label: "Imported", value: c.PROCESSED ?? 0, tone: "ok" as const }, { label: "Waiting", value: c.PENDING ?? 0, tone: "warn" as const }, { label: "Rejected", value: c.REJECTED ?? 0, tone: "bad" as const }].map((k) => (
              <div key={k.label} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink-2">{k.label} <Badge tone={k.tone}>events</Badge></p>
                <p className="mt-1 text-2xl font-bold text-ink">{fmtNumber(k.value)}</p>
              </div>
            ))}
          </section>

          <Card title="Recent synchronisation runs" description="Each run reads new events from MongoDB since the last successful run (with a 10-minute safety overlap; events are never imported twice).">
            {q.data.runs.length === 0 ? <EmptyState title="No synchronisation has run yet" hint="Send events to POST /api/events, then press “Synchronise events now”." /> : (
              <Table caption="Synchronisation runs">
                <thead><tr><Th>Run</Th><Th>Started</Th><Th>Status</Th><Th className="text-right">New events staged</Th><Th>Latest event read</Th></tr></thead>
                <tbody>
                  {q.data.runs.map((r) => (
                    <tr key={r.run_id}>
                      <Td className="tabular-nums">#{r.run_id}</Td><Td className="whitespace-nowrap">{fmtDateTime(r.started_at)}</Td>
                      <Td><Badge tone={r.status === "SUCCESS" ? "ok" : r.status === "FAILED" ? "bad" : "warn"}>{r.status}</Badge></Td>
                      <Td className="text-right tabular-nums">{fmtNumber(r.events_ingested)}</Td><Td className="whitespace-nowrap">{r.last_event_ts ? fmtDateTime(r.last_event_ts) : "-"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Rejected events" description="Events that could not be imported, with the reason. They do not block other events. Fix the sender (for example use a valid ad id for the channel) and send the event again.">
            {q.data.rejected.length === 0 ? <EmptyState title="No rejected events" hint="Every event read so far was imported." /> : (
              <Table caption="Rejected events">
                <thead><tr><Th>Event time</Th><Th>Type</Th><Th>User</Th><Th>Channel</Th><Th>Reason</Th></tr></thead>
                <tbody>
                  {q.data.rejected.map((r) => (
                    <tr key={r.mongo_event_id}>
                      <Td className="whitespace-nowrap">{fmtDateTime(r.event_time)}</Td><Td>{r.event_type}</Td><Td className="tabular-nums">{r.external_user_id}</Td><Td>{r.channel_name}</Td><Td>{r.reject_reason}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Sending events" description="Ad servers and trackers post events with the API key (set INGEST_API_KEY on the server). Use the ad id shown on the Ads page.">
            <pre className="overflow-x-auto rounded-md bg-page p-4 text-sm text-ink"><code>{`curl -X POST http://localhost:3000/api/events \\
  -H "Content-Type: application/json" -H "x-api-key: $INGEST_API_KEY" \\
  -d '{"user_id": 3, "event_type": "CLICK", "channel": "Instagram", "ad_id": 8, "device_type": "Mobile"}'`}</code></pre>
            <p className="mt-3 text-sm text-ink-2">Event types: IMPRESSION, CLICK, VISIT, ADD_TO_CART, PURCHASE (purchases also need <code>revenue</code> and a unique <code>order_reference</code>). Impressions and clicks need an <code>ad_id</code> whose channel matches the stated channel.</p>
          </Card>
        </div>
      )}
    </>
  );
}
