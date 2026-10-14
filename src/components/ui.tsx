// Small shared building blocks for every page.
import Link from "next/link";
import { STATUS_LABELS, type Status } from "@/lib/config";

export function PageHeader({ title, intro, action }: { title: string; intro?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">{title}</h1>
        {intro && <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{intro}</p>}
      </div>
      {action}
    </header>
  );
}

export function Card({ title, children, className = "", aside }: { title?: string; children: React.ReactNode; className?: string; aside?: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 md:p-6 ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
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
      {hint && <p className="text-xs leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

const STATUS_TONE: Record<Status, string> = {
  new: "border-stamp bg-warn-soft text-warn",
  applied: "border-accent bg-accent text-accent-ink",
  response: "border-good/40 bg-good-soft text-good",
  interview: "border-good bg-good-soft text-good",
  offer: "border-good bg-good text-white",
  rejected: "border-line text-muted line-through decoration-1",
  dismissed: "border-line text-muted",
  expired: "border-line text-muted",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span data-status={status} className={`inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function Score({ value }: { value: number }) {
  const tone = value >= 85 ? "text-good" : value >= 75 ? "text-accent" : "text-muted";
  return <span className={`font-display text-lg font-bold tabular-nums ${tone}`} title="Match score out of 100">{value}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent">{children}</Link>;
}

export const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition-colors hover:bg-[color-mix(in_oklab,var(--accent),black_15%)] disabled:opacity-60";
export const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
export const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-bad/40 bg-surface px-4 py-2.5 text-sm font-semibold text-bad transition-colors hover:bg-bad-soft";
