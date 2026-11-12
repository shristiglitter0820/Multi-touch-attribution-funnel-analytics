"use client";
import { useState } from "react";
import { Alert, Button, EmptyState, Field, fmtDate, fmtMoney, Input, LoadingState, PageHeader, Select, StatusBadge, Table, Td, Th, type Tone } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";

type Campaign = { campaign_id: number; name: string; objective: string | null; total_budget: number; spent: number; status: string; start_date: string; end_date: string };
type Form = { name: string; objective: string; total_budget: string; start_date: string; end_date: string; status: string };
const EMPTY: Form = { name: "", objective: "", total_budget: "", start_date: "", end_date: "", status: "DRAFT" };

export function CampaignsClient() {
  const [reload, setReload] = useState(0);
  const q = useApi<Campaign[]>("/api/admin/campaigns", reload);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: Tone; text: string } | null>(null);

  function open(c: Campaign | "new") {
    setErrors({}); setFormError("");
    setForm(c === "new" ? EMPTY : { name: c.name, objective: c.objective ?? "", total_budget: String(c.total_budget), start_date: c.start_date, end_date: c.end_date, status: c.status });
    setEditing(c);
  }
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErrors({}); setFormError("");
    const body = JSON.stringify({
      name: form.name, objective: form.objective, total_budget: form.total_budget === "" ? undefined : Number(form.total_budget),
      start_date: form.start_date, end_date: form.end_date, status: form.status,
    });
    try {
      if (editing === "new") await api("/api/admin/campaigns", { method: "POST", body });
      else if (editing) await api(`/api/admin/campaigns/${editing.campaign_id}`, { method: "PATCH", body });
      setNotice({ tone: "success", text: editing === "new" ? `Campaign "${form.name}" created.` : `Campaign "${form.name}" updated.` });
      setEditing(null); setReload((r) => r + 1);
    } catch (err) {
      if (err instanceof ApiError) { setErrors(err.fields); setFormError(err.message); } else setFormError("Something went wrong. Please try again.");
    }
    setSaving(false);
  }

  const rows = q.data ?? [];
  const isEdit = editing !== null && editing !== "new";
  return (
    <>
      <PageHeader title="Campaign management" subtitle="Create and edit campaigns. Campaigns are never deleted; set the status to ENDED to retire one."
        actions={<Button onClick={() => open("new")}>New campaign</Button>} />
      <div className="mb-4 space-y-3" aria-live="polite">{notice && <Alert tone={notice.tone} onClose={() => setNotice(null)}>{notice.text}</Alert>}</div>

      {q.loading && <LoadingState label="Loading campaigns..." />}
      {q.error && <Alert tone="error">Could not load campaigns: {q.error}</Alert>}
      {!q.loading && !q.error && rows.length === 0 && <EmptyState title="No campaigns yet" hint="Create your first campaign to start tracking spend and funnels." action={<Button onClick={() => open("new")}>New campaign</Button>} />}
      {rows.length > 0 && (
        <Table caption="Campaigns" minW="min-w-0">
          <thead><tr><Th>Campaign</Th><Th>Status</Th><Th className="text-right">Budget</Th><Th className="hidden text-right md:table-cell">Spent</Th><Th className="hidden md:table-cell">Dates</Th><Th><span className="sr-only">Actions</span></Th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.campaign_id}>
                <Td><span className="font-semibold">{c.name}</span>{c.objective && <span className="block text-ink-3">Objective: {c.objective}</span>}<span className="block text-ink-3 md:hidden">{fmtDate(c.start_date)} – {fmtDate(c.end_date)} · spent {fmtMoney(c.spent)}</span></Td>
                <Td><StatusBadge status={c.status} /></Td>
                <Td className="text-right tabular-nums">{fmtMoney(c.total_budget)}</Td>
                <Td className="hidden text-right tabular-nums md:table-cell">{fmtMoney(c.spent)}</Td>
                <Td className="hidden md:table-cell">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</Td>
                <Td className="text-right"><Button variant="secondary" onClick={() => open(c)} aria-label={`Edit ${c.name}`}>Edit</Button></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={editing !== null} title={isEdit ? "Edit campaign" : "New campaign"} onClose={() => setEditing(null)}>
        <form onSubmit={save} className="space-y-4" noValidate>
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Campaign name" htmlFor="c-name" error={errors.name}><Input id="c-name" value={form.name} onChange={set("name")} aria-invalid={!!errors.name} required /></Field>
          <Field label="Objective (optional)" htmlFor="c-obj" error={errors.objective} hint="For example SALES or AWARENESS."><Input id="c-obj" value={form.objective} onChange={set("objective")} maxLength={40} /></Field>
          <Field label="Total budget (USD)" htmlFor="c-budget" error={errors.total_budget}
            hint={isEdit ? `Spent so far: ${fmtMoney((editing as Campaign).spent)}. The budget cannot be set lower than this.` : undefined}>
            <Input id="c-budget" type="number" min="0.01" step="0.01" inputMode="decimal" value={form.total_budget} onChange={set("total_budget")} aria-invalid={!!errors.total_budget} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="c-start" error={errors.start_date}><Input id="c-start" type="date" value={form.start_date} onChange={set("start_date")} aria-invalid={!!errors.start_date} required /></Field>
            <Field label="End date" htmlFor="c-end" error={errors.end_date}><Input id="c-end" type="date" value={form.end_date} onChange={set("end_date")} aria-invalid={!!errors.end_date} required /></Field>
          </div>
          <Field label="Status" htmlFor="c-status" error={errors.status} hint="ENDED retires the campaign. It is kept for reporting and the audit trail.">
            <Select id="c-status" value={form.status} onChange={set("status")}>
              {["DRAFT", "ACTIVE", "PAUSED", "ENDED"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : isEdit ? "Save changes" : "Create campaign"}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
