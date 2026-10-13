import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dashboardCounts, getProfile, listApplications } from "@/lib/store";
import { Card, Empty, PageHeader, Score, StatusBadge, TextLink } from "@/components/ui";
import { SearchNow } from "./SearchNow";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const [profile, counts, waiting, recent, { welcome }] = await Promise.all([
    getProfile(db, user.id),
    dashboardCounts(db, user.id),
    listApplications(db, user.id, ["needs_action", "needs_approval"]),
    listApplications(db, user.id),
    searchParams,
  ]);

  // Setup checklist: what the search needs before it can work well.
  const steps = [
    { done: !!profile.fullName && !!profile.phone, label: "Add your name and contact details", href: "/profile" },
    { done: profile.experience.length > 0, label: "Add your work history to the master CV", href: "/cv" },
    { done: profile.skills.some((s) => s.onCv || s.ticked), label: "List your skills and tick your skills bank", href: "/cv" },
    { done: profile.salaryFloor.usd != null || profile.salaryFloor.gbp != null, label: "Set your salary floor and locations", href: "/preferences" },
  ];
  const setupDone = steps.every((s) => s.done);
  const stat = (label: string, n: number, tone = "") => (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone}`}>{n}</p>
    </div>
  );
  const applied = ["applied", "response", "interview", "offer", "rejected"].reduce((n, s) => n + (counts[s as keyof typeof counts] ?? 0), 0);

  return (
    <>
      <PageHeader title="Dashboard" intro={welcome ? "Email confirmed. Set up your profile below, then run your first search." : profile.paused ? "Searching is paused." : "Searches run every few hours; the report arrives at midnight."} action={<SearchNow />} />

      {!setupDone && (
        <Card title="Finish setting up" className="mb-6">
          <ol className="space-y-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-sm">
                <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${s.done ? "bg-good-soft text-good" : "border border-line text-muted"}`}>{s.done ? "✓" : ""}</span>
                {s.done ? <span className="text-muted line-through">{s.label}</span> : <TextLink href={s.href}>{s.label}</TextLink>}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat("Waiting for you", (counts.needs_approval ?? 0) + (counts.needs_action ?? 0), "text-warn")}
        {stat("Queued to submit", counts.queued ?? 0, "text-accent")}
        {stat("Applied", applied)}
        {stat("Interviews", (counts.interview ?? 0) + (counts.offer ?? 0), "text-good")}
      </div>

      <Card title="Waiting for you" className="mb-6" aside={waiting.length > 0 && <TextLink href="/applications?view=waiting">See all</TextLink>}>
        {waiting.length === 0 ? (
          <Empty title="Nothing waiting">New matches that need your approval or input show up here.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {waiting.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className="flex items-center justify-between gap-4 py-3 hover:opacity-80">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.title}</p>
                    <p className="truncate text-sm text-muted">{a.company} · {a.region} · {a.mode}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3"><Score value={a.score} /><StatusBadge status={a.status} /></div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Recent activity">
        {recent.length === 0 ? (
          <Empty title="No applications yet">{setupDone ? "Press Search now to find your first matches." : "Finish setting up, then press Search now."}</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {recent.slice(0, 8).map((a) => (
              <li key={a.id}>
                <Link href={`/applications/${a.id}`} className="flex items-center justify-between gap-4 py-3 hover:opacity-80">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.title} <span className="font-normal text-muted">at {a.company}</span></p>
                    <p className="text-xs text-muted">Updated {a.updated_at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
