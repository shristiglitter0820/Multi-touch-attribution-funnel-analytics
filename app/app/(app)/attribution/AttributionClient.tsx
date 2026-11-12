"use client";
import { useState } from "react";
import { Alert, Button, Card, EmptyState, Field, fmtMoney, fmtNumber, LoadingState, PageHeader, Select, Table, Td, Th } from "@/components/ui";
import { AttributionChart, type AttrRow } from "@/components/charts";
import { useApi } from "@/lib/useApi";

type Model = "FIRST_TOUCH" | "LAST_TOUCH" | "LINEAR";
type Roi = {
  campaign_id: number; campaign_name: string; spend: number; impressions: number; clicks: number; ctr_pct: number | null;
  credited_conversions: number; attributed_revenue: number; conversion_rate_pct: number | null; roi_pct: number | null; roas: number | null; cpa: number | null;
};
type AttrData = { campaign_id: number; campaign_name: string; channel_name: string; model_name: Model; credited_conversions: number; attributed_revenue: number };

const MODELS: { id: Model; label: string; help: string }[] = [
  { id: "FIRST_TOUCH", label: "First touch", help: "100% of the order revenue goes to the first ad the customer saw or clicked." },
  { id: "LAST_TOUCH", label: "Last touch", help: "100% goes to the last ad touch before the purchase." },
  { id: "LINEAR", label: "Linear", help: "Revenue is split equally across every ad touch in the customer's journey." },
];
const pct = (v: number | null) => (v === null ? "-" : `${v}%`);
const money = (v: number | null) => (v === null ? "-" : fmtMoney(v));

export function AttributionClient() {
  const [model, setModel] = useState<Model>("LAST_TOUCH");
  const [campaign, setCampaign] = useState("");
  const roiQ = useApi<{ model: Model; campaigns: Roi[] }>(`/api/analytics/roi?model=${model}`);
  const attrQ = useApi<AttrData[]>(`/api/analytics/attribution${campaign ? `?campaign_id=${campaign}` : ""}`);

  const campaigns = roiQ.data?.campaigns ?? [];
  const shown = campaign ? campaigns.filter((c) => String(c.campaign_id) === campaign) : campaigns;
  const totalSpend = shown.reduce((a, c) => a + c.spend, 0);
  const totalRevenue = shown.reduce((a, c) => a + c.attributed_revenue, 0);
  const overallRoi = totalSpend > 0 ? Math.round(((totalRevenue - totalSpend) / totalSpend) * 10000) / 100 : null;

  const byChannel = new Map<string, AttrRow>();
  for (const r of attrQ.data ?? []) {
    const row = byChannel.get(r.channel_name) ?? { channel: r.channel_name, FIRST_TOUCH: 0, LAST_TOUCH: 0, LINEAR: 0 };
    row[r.model_name] += r.attributed_revenue;
    byChannel.set(r.channel_name, row);
  }
  const chartRows = [...byChannel.values()].sort((a, b) => b.LINEAR - a.LINEAR);
  const current = MODELS.find((m) => m.id === model)!;

  return (
    <>
      <PageHeader title="Attribution & ROI" subtitle="Which ads and channels earn the revenue, under three attribution models." />

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-ink-2">Attribution model</legend>
          <div className="flex flex-wrap gap-2">
            {MODELS.map((m) => (
              <Button key={m.id} variant={model === m.id ? "primary" : "secondary"} aria-pressed={model === m.id} onClick={() => setModel(m.id)}>{m.label}</Button>
            ))}
          </div>
        </fieldset>
        <div className="w-64">
          <Field label="Campaign" htmlFor="attr-campaign">
            <Select id="attr-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
              <option value="">All campaigns</option>
              {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <p className="mb-6 text-sm text-ink-2"><strong>{current.label}:</strong> {current.help} Spend is computed from each ad&apos;s pricing (cost per click or per 1,000 views) and the tracked clicks and impressions.</p>

      {roiQ.loading && <LoadingState label="Loading campaign performance..." />}
      {roiQ.error && <Alert tone="error">Could not load campaign performance: {roiQ.error}</Alert>}
      {roiQ.data && shown.length === 0 && <EmptyState title="No campaigns to analyse" hint="Create a campaign and ads first (Admin)." />}

      {roiQ.data && shown.length > 0 && (
        <>
          <section aria-label="Summary" className="mb-6 grid gap-4 sm:grid-cols-3">
            {[
              { label: "Total spend", value: fmtMoney(totalSpend) },
              { label: `Attributed revenue (${current.label.toLowerCase()})`, value: fmtMoney(totalRevenue) },
              { label: "Overall ROI", value: overallRoi === null ? "-" : `${overallRoi}%` },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-line bg-surface p-5 shadow-sm">
                <p className="text-sm font-semibold text-ink-2">{k.label}</p>
                <p className="mt-1 text-2xl font-bold text-ink">{k.value}</p>
              </div>
            ))}
          </section>

          <Card title="Campaign performance" description="ROI = (attributed revenue - spend) / spend. CTR = clicks / impressions. A dash means the value cannot be calculated (for example no impressions recorded).">
            <Table caption={`Campaign performance under the ${current.label} model`}>
              <thead><tr><Th>Campaign</Th><Th className="text-right">Spend</Th><Th className="text-right">Impressions</Th><Th className="text-right">Clicks</Th><Th className="text-right">CTR</Th><Th className="text-right">Conversions</Th><Th className="text-right">Conv. rate</Th><Th className="text-right">Revenue</Th><Th className="text-right">ROI</Th><Th className="text-right">CPA</Th></tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.campaign_id}>
                    <Td className="font-semibold">{c.campaign_name}</Td>
                    <Td className="text-right tabular-nums">{fmtMoney(c.spend)}</Td>
                    <Td className="text-right tabular-nums">{fmtNumber(c.impressions)}</Td>
                    <Td className="text-right tabular-nums">{fmtNumber(c.clicks)}</Td>
                    <Td className="text-right tabular-nums">{pct(c.ctr_pct)}</Td>
                    <Td className="text-right tabular-nums">{c.credited_conversions}</Td>
                    <Td className="text-right tabular-nums">{pct(c.conversion_rate_pct)}</Td>
                    <Td className="text-right tabular-nums">{fmtMoney(c.attributed_revenue)}</Td>
                    <Td className="text-right tabular-nums font-semibold">{c.roi_pct === null ? "-" : `${c.roi_pct > 0 ? "+" : ""}${c.roi_pct}%${c.roi_pct < 0 ? " (loss)" : ""}`}</Td>
                    <Td className="text-right tabular-nums">{money(c.cpa)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>

          <div className="mt-6">
            <Card title="Revenue by channel and model" description="The same orders credited three ways. Differences show which channels introduce customers (first touch) and which close the sale (last touch).">
              {attrQ.loading && <LoadingState label="Loading attribution..." />}
              {attrQ.error && <Alert tone="error">Could not load attribution: {attrQ.error}</Alert>}
              {attrQ.data && chartRows.length === 0 && (
                <EmptyState title="No attributed conversions yet" hint="Purchases appear here after their events are synchronised from MongoDB (Admin: Events page) and the customer had at least one ad impression or click." />
              )}
              {chartRows.length > 0 && (
                <div className="space-y-6">
                  <AttributionChart rows={chartRows} />
                  <Table caption="Attributed revenue by channel and model">
                    <thead><tr><Th>Channel</Th><Th className="text-right">First touch</Th><Th className="text-right">Last touch</Th><Th className="text-right">Linear</Th></tr></thead>
                    <tbody>
                      {chartRows.map((r) => (
                        <tr key={r.channel}><Td className="font-semibold">{r.channel}</Td>
                          <Td className="text-right tabular-nums">{fmtMoney(r.FIRST_TOUCH)}</Td><Td className="text-right tabular-nums">{fmtMoney(r.LAST_TOUCH)}</Td><Td className="text-right tabular-nums">{fmtMoney(r.LINEAR)}</Td></tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
