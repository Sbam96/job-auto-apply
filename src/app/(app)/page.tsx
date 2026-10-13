import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dashboardCounts, getProfile, lastSearch, listApplications } from "@/lib/store";
import { Card, Empty, Score, StatusBadge, TextLink } from "@/components/ui";
import { LastSearch } from "./LastSearch";
import { RouteMap } from "./RouteMap";
import { SearchNow } from "./SearchNow";

function greeting(now: Date) {
  const h = Number(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
  return h < 5 ? "Up late" : h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const db = await getDb();
  const [profile, counts, waiting, recent, run, { welcome }] = await Promise.all([
    getProfile(db, user.id),
    dashboardCounts(db, user.id),
    listApplications(db, user.id, ["needs_action", "needs_approval"]),
    listApplications(db, user.id),
    lastSearch(db, user.id),
    searchParams,
  ]);
  const firstName = profile.fullName.trim().split(/\s+/)[0];
  const waitingCount = waiting.length;
  const queued = counts.queued ?? 0;

  // What the search needs before it can work well.
  const steps = [
    { done: !!profile.fullName && !!profile.phone, label: "Add your name and contact details", href: "/profile" },
    { done: profile.experience.length > 0, label: "Add your work history to the master CV", href: "/cv" },
    { done: profile.skills.some((s) => s.onCv || s.ticked), label: "List your skills and tick your skills bank", href: "/cv" },
    { done: profile.salaryFloor.usd != null || profile.salaryFloor.gbp != null, label: "Set your pay floor and locations", href: "/preferences" },
  ];
  const setupDone = steps.every((s) => s.done);

  const summary = welcome
    ? "Your email's confirmed. Set up your profile below, then run your first search."
    : profile.paused
      ? "Searching is paused. Turn it back on in Job preferences."
      : waitingCount > 0
        ? `${waitingCount} ${waitingCount === 1 ? "application needs" : "applications need"} you before ${waitingCount === 1 ? "it goes" : "they go"} out.`
        : queued > 0
          ? `Nothing needs you. ${queued} ${queued === 1 ? "is" : "are"} queued for your laptop worker.`
          : "Nothing needs you right now. The next search runs automatically.";

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">{greeting(new Date())}{firstName ? `, ${firstName}` : ""}.</h1>
          <p className="mt-2 max-w-xl text-lg text-muted">{summary}</p>
        </div>
        <SearchNow />
      </header>

      <RouteMap counts={counts} />
      <LastSearch run={run} />

      {!setupDone && (
        <Card title="Finish setting up" className="mb-8 border-l-4 border-l-stamp">
          <ul className="space-y-2.5">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-3 text-[0.95rem]">
                <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${s.done ? "bg-good text-white" : "border-2 border-line"}`}>{s.done ? "✓" : ""}</span>
                {s.done ? <span className="text-muted line-through">{s.label}</span> : <TextLink href={s.href}>{s.label}</TextLink>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3" aria-labelledby="waiting-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="waiting-h" className="text-xl font-semibold">Waiting for you</h2>
            {waitingCount > 0 && <TextLink href="/applications?view=waiting">See all</TextLink>}
          </div>
          {waitingCount === 0 ? (
            <Empty title="All clear">Matches that need your approval or an answer show up here.</Empty>
          ) : (
            <ul className="space-y-3">
              {waiting.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link href={`/applications/${a.id}`} className={`flex items-center justify-between gap-4 rounded-xl border bg-surface px-4 py-3.5 transition-colors hover:border-accent ${a.status === "needs_action" ? "border-l-4 border-line border-l-red" : "border-line"}`}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{a.title}</p>
                      <p className="truncate text-sm text-muted">{a.company}, {a.region} {a.mode}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3"><Score value={a.score} /><StatusBadge status={a.status} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="lg:col-span-2" aria-labelledby="recent-h">
          <h2 id="recent-h" className="mb-3 text-xl font-semibold">Latest</h2>
          {recent.length === 0 ? (
            <Empty title="No applications yet">{setupDone ? "Press Search now to find your first matches." : "Finish setting up, then press Search now."}</Empty>
          ) : (
            <ol className="relative space-y-4 border-l-2 border-line pl-5">
              {recent.slice(0, 7).map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden className="absolute -left-[1.6rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
                  <Link href={`/applications/${a.id}`} className="block hover:text-accent">
                    <p className="text-sm font-semibold">{a.title} <span className="font-normal text-muted">at {a.company}</span></p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-muted"><StatusBadge status={a.status} /> {a.updated_at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
