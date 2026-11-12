"use client";
import { useState } from "react";
import { Alert, Badge, Button, EmptyState, Field, fmtNumber, Input, LoadingState, PageHeader, Select, Table, Td, Th, type Tone } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type Ad = { ad_id: number; campaign_id: number; campaign_name: string; channel_id: number; channel_name: string; ad_name: string; ad_format: string | null; pricing_model: "CPC" | "CPM"; unit_cost: number; status: string; tracked_events: number };
type Lookups = { channels: { channel_id: number; channel_name: string }[]; campaigns: { campaign_id: number; name: string; status: string }[] };
type Form = { campaign_id: string; channel_id: string; ad_name: string; ad_format: string; pricing_model: string; unit_cost: string; status: string };
const EMPTY: Form = { campaign_id: "", channel_id: "", ad_name: "", ad_format: "", pricing_model: "CPC", unit_cost: "", status: "ACTIVE" };

export function AdsClient() {
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState("");
  const adsQ = useApi<Ad[]>(`/api/admin/ads${filter ? `?campaign_id=${filter}` : ""}`, reload);
  const lookQ = useApi<Lookups>("/api/lookups");
  const [editing, setEditing] = useState<Ad | "new" | null>(null);
  const [deleting, setDeleting] = useState<Ad | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);
  const [delError, setDelError] = useState("");

  const channels = lookQ.data?.channels ?? [];
  const campaigns = lookQ.data?.campaigns ?? [];
  function open(a: Ad | "new") {
    setErrors({}); setFormError("");
    setForm(a === "new" ? { ...EMPTY, campaign_id: filter || String(campaigns[0]?.campaign_id ?? ""), channel_id: String(channels[0]?.channel_id ?? "") }
      : { campaign_id: String(a.campaign_id), channel_id: String(a.channel_id), ad_name: a.ad_name, ad_format: a.ad_format ?? "", pricing_model: a.pricing_model, unit_cost: String(a.unit_cost), status: a.status });
    setEditing(a);
  }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErrors({}); setFormError("");
    const common = { channel_id: Number(form.channel_id), ad_name: form.ad_name, ad_format: form.ad_format, pricing_model: form.pricing_model, unit_cost: form.unit_cost === "" ? undefined : Number(form.unit_cost), status: form.status };
    try {
      if (editing === "new") await api("/api/admin/ads", { method: "POST", body: JSON.stringify({ ...common, campaign_id: Number(form.campaign_id) }) });
      else if (editing) await api(`/api/admin/ads/${editing.ad_id}`, { method: "PATCH", body: JSON.stringify(common) });
      setNotice({ tone: "success", text: editing === "new" ? `Ad "${form.ad_name}" created.` : `Ad "${form.ad_name}" updated.` });
      setEditing(null); setReload((r) => r + 1);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setFormError(err.message); } else setFormError("Something went wrong. Please try again.");
    }
    setSaving(false);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true); setDelError("");
    try {
      await api(`/api/admin/ads/${deleting.ad_id}`, { method: "DELETE" });
      setNotice({ tone: "success", text: `Ad "${deleting.ad_name}" deleted.` });
      setDeleting(null); setReload((r) => r + 1);
    } catch (err) { setDelError((err as Error).message); }
    setSaving(false);
  }

  const rows = adsQ.data ?? [];
  const isEdit = editing !== null && editing !== "new";
  return (
    <>
      <PageHeader title="Ad management" subtitle="Create, edit and delete the ads that belong to your campaigns."
        actions={<Button onClick={() => open("new")} disabled={lookQ.loading || campaigns.length === 0}>New ad</Button>} />
      <div className="mb-4 space-y-3" aria-live="polite">{notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}</div>

      <div className="mb-4 max-w-xs">
        <Field label="Filter by campaign" htmlFor="ad-filter">
          <Select id="ad-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All campaigns</option>
            {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>

      {adsQ.loading && <LoadingState label="Loading ads..." />}
      {adsQ.error && <Alert tone="error">Could not load ads: {adsQ.error}</Alert>}
      {!adsQ.loading && !adsQ.error && rows.length === 0 && <EmptyState title="No ads found" hint="Create an ad and assign it to a campaign and channel." />}
      {rows.length > 0 && (
        <Table caption="Ads" minW="min-w-0">
          <thead><tr><Th>Ad</Th><Th className="hidden lg:table-cell">Campaign</Th><Th className="hidden lg:table-cell">Channel</Th><Th className="hidden lg:table-cell">Pricing</Th><Th>Status</Th><Th className="hidden text-right lg:table-cell">Tracked events</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.ad_id}>
                <Td><span className="font-semibold">{a.ad_name}</span><span className="block text-ink-3">ID {a.ad_id}{a.ad_format ? ` · ${a.ad_format}` : ""}</span><span className="block text-ink-3 lg:hidden">{a.campaign_name} · {a.channel_name} · {a.pricing_model} ${a.unit_cost} · {fmtNumber(a.tracked_events)} events</span></Td>
                <Td className="hidden lg:table-cell">{a.campaign_name}</Td>
                <Td className="hidden lg:table-cell">{a.channel_name}</Td>
                <Td className="hidden lg:table-cell">{a.pricing_model} · ${a.unit_cost}</Td>
                <Td><Badge tone={a.status === "ACTIVE" ? "ok" : "warn"}>{a.status}</Badge></Td>
                <Td className="hidden text-right tabular-nums lg:table-cell">{fmtNumber(a.tracked_events)}</Td>
                <Td className="text-right">
                  <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
                    <Button variant="secondary" onClick={() => open(a)} aria-label={`Edit ${a.ad_name}`}>Edit</Button>
                    <Button variant="danger" onClick={() => { setDelError(""); setDeleting(a); }} aria-label={`Delete ${a.ad_name}`}>Delete</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={editing !== null} title={isEdit ? "Edit ad" : "New ad"} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Campaign" htmlFor="a-campaign" error={errors.campaign_id} hint={isEdit ? "An ad cannot be moved to another campaign because that would rewrite its reporting history." : undefined}>
            <Select id="a-campaign" value={form.campaign_id} onChange={set("campaign_id")} disabled={isEdit}>
              {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Ad name" htmlFor="a-name" error={errors.ad_name}><Input id="a-name" value={form.ad_name} onChange={set("ad_name")} aria-invalid={!!errors.ad_name} required /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Channel" htmlFor="a-channel" error={errors.channel_id}>
              <Select id="a-channel" value={form.channel_id} onChange={set("channel_id")}>{channels.map((c) => <option key={c.channel_id} value={c.channel_id}>{c.channel_name}</option>)}</Select>
            </Field>
            <Field label="Format (optional)" htmlFor="a-format" error={errors.ad_format} hint="banner, video, text, ..."><Input id="a-format" value={form.ad_format} onChange={set("ad_format")} maxLength={30} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Pricing model" htmlFor="a-pricing" error={errors.pricing_model}>
              <Select id="a-pricing" value={form.pricing_model} onChange={set("pricing_model")}><option value="CPC">CPC (per click)</option><option value="CPM">CPM (per 1,000 views)</option></Select>
            </Field>
            <Field label="Unit cost (USD)" htmlFor="a-cost" error={errors.unit_cost}>
              <Input id="a-cost" type="number" min="0" step="0.0001" inputMode="decimal" value={form.unit_cost} onChange={set("unit_cost")} aria-invalid={!!errors.unit_cost} required />
            </Field>
            <Field label="Status" htmlFor="a-status" error={errors.status}>
              <Select id="a-status" value={form.status} onChange={set("status")}><option value="ACTIVE">ACTIVE</option><option value="PAUSED">PAUSED</option></Select>
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : isEdit ? "Save changes" : "Create ad"}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={deleting !== null} title="Delete ad?" onClose={() => setDeleting(null)}>
        {deleting && (
          <div className="space-y-4">
            <p className="text-base text-ink">You are about to permanently delete <strong>{deleting.ad_name}</strong> from <strong>{deleting.campaign_name}</strong>.</p>
            {deleting.tracked_events > 0 && <Alert tone="warning">This ad has {fmtNumber(deleting.tracked_events)} recorded impressions and clicks. The database protects that history and will refuse the delete; pause the ad instead.</Alert>}
            {delError && <Alert tone="error">{delError}</Alert>}
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} disabled={saving}>{saving ? "Deleting..." : "Delete ad"}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
