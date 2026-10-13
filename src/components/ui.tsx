// Small shared building blocks for every page.
import Link from "next/link";
import { STATUS_LABELS, type Status } from "@/lib/config";

export function PageHeader({ title, intro, action }: { title: string; intro?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {intro && <p className="mt-1 max-w-2xl text-sm text-muted">{intro}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ title, children, className = "", aside }: { title?: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const STATUS_TONE: Record<Status, string> = {
  skipped: "bg-canvas text-muted",
  needs_approval: "bg-warn-soft text-warn",
  needs_action: "bg-bad-soft text-bad",
  queued: "bg-accent-soft text-accent",
  applied: "bg-accent-soft text-accent",
  response: "bg-good-soft text-good",
  interview: "bg-good-soft text-good",
  offer: "bg-good-soft text-good",
  rejected: "bg-canvas text-muted",
  withdrawn: "bg-canvas text-muted",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span data-status={status} className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Score({ value }: { value: number }) {
  const tone = value >= 85 ? "text-good" : value >= 75 ? "text-accent" : "text-muted";
  return <span className={`font-semibold tabular-nums ${tone}`} title="Match score out of 100">{value}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="font-medium text-accent underline-offset-2 hover:underline">{children}</Link>;
}

export const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition hover:opacity-90 disabled:opacity-60";
export const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:bg-canvas disabled:opacity-60";
export const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-bad/40 bg-surface px-4 py-2 text-sm font-medium text-bad transition hover:bg-bad-soft";
