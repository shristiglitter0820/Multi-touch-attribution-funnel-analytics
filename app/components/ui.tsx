// Shared presentational components. All colours come from the tokens in globals.css.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------- layout ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, selected }: {
  title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; selected?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border bg-surface p-5 shadow-sm", selected ? "border-brand ring-1 ring-brand" : "border-line", className)}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-lg font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/* ---------- buttons ---------- */
type Variant = "primary" | "secondary" | "danger" | "onDark";
const VARIANT: Record<Variant, string> = {
  primary: "bg-brand text-white hover:bg-brand-hover border border-transparent",
  secondary: "bg-surface text-ink border border-control hover:bg-page",
  danger: "bg-danger text-white hover:bg-danger-hover border border-transparent",
  onDark: "bg-transparent text-on-dark border border-on-dark-2 hover:bg-nav-2",
};
export function Button({ variant = "primary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-neutral-bg disabled:text-ink-3",
        VARIANT[variant], className
      )}
    />
  );
}

/* ---------- form controls ---------- */
const CONTROL =
  "block w-full min-h-10 rounded-md border border-control bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-3 " +
  "disabled:cursor-not-allowed disabled:bg-neutral-bg disabled:text-ink-3 aria-[invalid=true]:border-danger aria-[invalid=true]:border-2";

export function Field({ label, htmlFor, hint, error, children }: {
  label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-semibold text-ink-2">{label}</label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-sm text-ink-3">{hint}</p>}
      {error && <p id={`${htmlFor}-err`} className="mt-1 text-sm font-medium text-bad-fg"><span aria-hidden="true">! </span>{error}</p>}
    </div>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cn(CONTROL, props.className)} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cn(CONTROL, props.className)} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cn(CONTROL, props.className)} />; }

/* ---------- feedback ---------- */
export type Tone = "success" | "error" | "warning" | "info";
const TONE: Record<Tone, { box: string; label: string; icon: string }> = {
  success: { box: "bg-ok-bg text-ok-fg border-ok-fg", label: "Success", icon: "✓" },
  error: { box: "bg-bad-bg text-bad-fg border-bad-fg", label: "Error", icon: "✕" },
  warning: { box: "bg-warn-bg text-warn-fg border-warn-fg", label: "Note", icon: "!" },
  info: { box: "bg-info-bg text-info-fg border-info-fg", label: "Info", icon: "i" },
};
export function Alert({ tone, children, onClose }: { tone: Tone; children: ReactNode; onClose?: () => void }) {
  const t = TONE[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-md border-l-4 px-4 py-3 text-sm", t.box)}>
      <span aria-hidden="true" className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">{t.icon}</span>
      <p className="flex-1"><strong className="font-semibold">{t.label}: </strong>{children}</p>
      {onClose && <button onClick={onClose} aria-label="Dismiss message" className="rounded px-1 text-base font-bold leading-none">×</button>}
    </div>
  );
}

const BADGE: Record<string, string> = {
  ok: "bg-ok-bg text-ok-fg", warn: "bg-warn-bg text-warn-fg", bad: "bg-bad-bg text-bad-fg",
  info: "bg-info-bg text-info-fg", neutral: "bg-neutral-bg text-neutral-fg",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE; children: ReactNode }) {
  return <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", BADGE[tone])}>{children}</span>;
}
const STATUS_TONE: Record<string, keyof typeof BADGE> = { ACTIVE: "ok", DRAFT: "neutral", PAUSED: "warn", ENDED: "info" };
export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status}</Badge>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="h-2.5 w-full rounded-full bg-neutral-bg">
      <div className="h-2.5 rounded-full bg-brand" style={{ width: `${v}%` }} />
    </div>
  );
}

export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-ink-2">
      <span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-control border-t-brand" />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-control px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-md text-sm text-ink-3">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------- tables ---------- */
export function Table({ children, caption, minW = "min-w-[640px]" }: { children: ReactNode; caption: string; minW?: string }) {
  return (
    <div className="relative overflow-x-auto rounded-lg border border-line">
      <table className={cn("w-full border-collapse text-left text-sm", minW)}>
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={cn("bg-page px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-2", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-t border-line px-3 py-3 align-top text-ink", className)}>{children}</td>;
}

/* ---------- formatting helpers ---------- */
// Display currency is configurable (NEXT_PUBLIC_CURRENCY, default USD). Amounts are stored as plain numbers; Member 1's sample data is in INR.
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "USD";
const money = new Intl.NumberFormat(CURRENCY === "INR" ? "en-IN" : "en-US", { style: "currency", currency: CURRENCY });
export const fmtMoney = (n: number) => money.format(n);
export const fmtNumber = (n: number) => new Intl.NumberFormat("en-US").format(n);
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T00:00:00") : new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}
export function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
