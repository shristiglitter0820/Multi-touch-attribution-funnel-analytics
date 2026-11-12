"use client";
// Recharts wrappers. Colours match the design tokens (verified in tools/palette_check.py);
// all text is charcoal on white and every chart has a table/text equivalent on the page.
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtNumber } from "./ui";

const C = { blue: "#1d4ed8", slate: "#64748b", red: "#b91c1c", text: "#334155", grid: "#cbd5e1" };
const tick = { fill: C.text, fontSize: 12 };

type TipProps = { active?: boolean; payload?: { name?: string; value?: number; payload?: Record<string, unknown> }[]; label?: string };
function Tip({ active, payload, label, fmt }: TipProps & { fmt: (p: NonNullable<TipProps["payload"]>[number]) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-control bg-surface px-3 py-2 text-sm text-ink shadow">
      <p className="font-semibold text-ink">{label}</p>
      {payload.map((p, i) => <p key={i} className="text-ink-2">{fmt(p)}</p>)}
    </div>
  );
}

export type StageRow = { stage: string; order: number; visitors: number; pct_of_previous: number; dropoff_pct: number; pct_of_top: number };

export function FunnelChart({ stages }: { stages: StageRow[] }) {
  return (
    <div role="img" aria-label={`Funnel chart of visitors per stage: ${stages.map((s) => `${s.stage} ${s.visitors}`).join(", ")}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={stages} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={tick} stroke={C.text} allowDecimals={false} />
          <YAxis type="category" dataKey="stage" tick={tick} stroke={C.text} width={92} />
          <Tooltip cursor={{ fill: "#e2e8f0" }} content={<Tip fmt={(p) => `${fmtNumber(Number(p.value))} visitors (${p.payload?.pct_of_top}% of impressions)`} />} />
          <Bar dataKey="visitors" name="Visitors" fill={C.blue} isAnimationActive={false} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="visitors" position="right" fill={C.text} fontSize={12} formatter={(v) => fmtNumber(Number(v))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DropoffChart({ stages }: { stages: StageRow[] }) {
  const rows = stages.filter((s) => s.order > 1).map((s, i) => ({ name: `${stages[i].stage} → ${s.stage}`, dropoff: s.dropoff_pct }));
  return (
    <div role="img" aria-label={`Drop-off between stages: ${rows.map((r) => `${r.name} ${r.dropoff}%`).join(", ")}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" domain={[0, 100]} tick={tick} stroke={C.text} unit="%" />
          <YAxis type="category" dataKey="name" tick={tick} stroke={C.text} width={140} />
          <Tooltip cursor={{ fill: "#e2e8f0" }} content={<Tip fmt={(p) => `${p.value}% of visitors lost at this step`} />} />
          <Bar dataKey="dropoff" name="Drop-off %" fill={C.red} isAnimationActive={false} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="dropoff" position="right" fill={C.text} fontSize={12} formatter={(v) => `${v}%`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type BudgetRow = { name: string; spent: number; total_budget: number };

export function BudgetChart({ campaigns }: { campaigns: BudgetRow[] }) {
  const rows = campaigns.map((c) => ({ name: c.name, spent: c.spent, remaining: Math.max(c.total_budget - c.spent, 0) }));
  return (
    <div role="img" aria-label={`Budget utilisation: ${rows.map((r) => `${r.name} spent ${fmtMoney(r.spent)}, remaining ${fmtMoney(r.remaining)}`).join("; ")}`} className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={tick} stroke={C.text} tickFormatter={(v) => fmtMoney(Number(v))} />
          <YAxis type="category" dataKey="name" tick={tick} stroke={C.text} width={120} />
          <Tooltip cursor={{ fill: "#e2e8f0" }} content={<Tip fmt={(p) => `${p.name}: ${fmtMoney(Number(p.value))}`} />} />
          <Legend wrapperStyle={{ color: C.text, fontSize: 13 }} formatter={(v) => <span style={{ color: C.text }}>{v}</span>} />
          <Bar dataKey="spent" name="Spent" stackId="b" fill={C.blue} isAnimationActive={false} />
          <Bar dataKey="remaining" name="Remaining budget" stackId="b" fill={C.slate} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type AttrRow = { channel: string; FIRST_TOUCH: number; LAST_TOUCH: number; LINEAR: number };
const MODEL_COLORS = { FIRST_TOUCH: "#1d4ed8", LAST_TOUCH: "#0f766e", LINEAR: "#b45309" };
const MODEL_LABEL = { FIRST_TOUCH: "First touch", LAST_TOUCH: "Last touch", LINEAR: "Linear" };

/** Attributed revenue per channel under the three attribution models (grouped bars). */
export function AttributionChart({ rows }: { rows: AttrRow[] }) {
  return (
    <div role="img" aria-label={`Attributed revenue by channel and model: ${rows.map((r) => `${r.channel}: first ${fmtMoney(r.FIRST_TOUCH)}, last ${fmtMoney(r.LAST_TOUCH)}, linear ${fmtMoney(r.LINEAR)}`).join("; ")}`}
         style={{ height: Math.max(220, rows.length * 90 + 70) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
          <CartesianGrid horizontal={false} stroke={C.grid} />
          <XAxis type="number" tick={tick} stroke={C.text} tickFormatter={(v) => fmtMoney(Number(v))} />
          <YAxis type="category" dataKey="channel" tick={tick} stroke={C.text} width={92} />
          <Tooltip cursor={{ fill: "#e2e8f0" }} content={<Tip fmt={(p) => `${p.name}: ${fmtMoney(Number(p.value))}`} />} />
          <Legend wrapperStyle={{ color: C.text, fontSize: 13 }} formatter={(v) => <span style={{ color: C.text }}>{v}</span>} />
          {(Object.keys(MODEL_COLORS) as (keyof typeof MODEL_COLORS)[]).map((m) => (
            <Bar key={m} dataKey={m} name={MODEL_LABEL[m]} fill={MODEL_COLORS[m]} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
