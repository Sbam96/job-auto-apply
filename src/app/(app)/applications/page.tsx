import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getProfile, listApplications } from "@/lib/store";
import { formatSalary, proximity, salaryOf, SORTS, sortMatches, type SortKey } from "@/lib/sorting";
import { APPLIED_RETENTION_DAYS } from "@/lib/config";
import type { Status } from "@/lib/config";
import { Empty, PageHeader, Score, StatusBadge } from "@/components/ui";

const VIEWS: { key: string; label: string; statuses?: Status[] }[] = [
  { key: "ready", label: "Ready to apply", statuses: ["new"] },
  { key: "applied", label: "Applied", statuses: ["applied", "response", "interview", "offer"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "dismissed", "expired"] },
  { key: "all", label: "All" },
];

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string; sort?: string }> }) {
  const user = await requireUser();
  const { view = "ready", sort: sortParam } = await searchParams;
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const sort: SortKey = SORTS.find((s) => s.key === sortParam)?.key ?? "newest";
  const db = await getDb();
  const [rows, profile] = await Promise.all([listApplications(db, user.id, current.statuses), getProfile(db, user.id)]);
  const apps = sortMatches(rows, sort, profile); // SO-01 to SO-03
  const deleteOn = (applied: Date) => new Date(applied.getTime() + APPLIED_RETENTION_DAYS * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <PageHeader title="Matches" intro="Every role the app matched for you, with a CV made for each. Applied ones are kept for 6 months, then deleted with their documents." />
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} role="tab" aria-selected={v.key === current.key} href={`/applications?view=${v.key}&sort=${sort}`}
            className={`rounded-full border px-3 py-1 text-sm ${v.key === current.key ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface text-muted hover:text-ink"}`}>
            {v.label}
          </Link>
        ))}
      </div>
      <nav aria-label="Sort matches" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Sort by</span>
        {SORTS.map((s) => (
          <Link key={s.key} href={`/applications?view=${current.key}&sort=${s.key}`} aria-current={s.key === sort ? "true" : undefined}
            className={`rounded-md px-2.5 py-1 ${s.key === sort ? "bg-ink font-medium text-canvas" : "text-muted hover:text-ink"}`}>
            {s.label}
          </Link>
        ))}
      </nav>
      {apps.length === 0 ? (
        <Empty title={`Nothing in ${current.label.toLowerCase()}`} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-sm text-muted">
              <tr><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Where</th><th className="px-4 py-3 font-medium">Pay</th><th className="px-4 py-3 font-medium">Score</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Updated</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {apps.map((a) => (
                <tr key={a.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link href={`/applications/${a.id}`} className="font-medium hover:text-accent">{a.title}</Link>
                    <p className="text-muted">{a.company}{a.flags.length > 0 && <span className="ml-2 text-warn" title={a.flags.join("\n")}>⚑ {a.flags.length} note{a.flags.length > 1 ? "s" : ""}</span>}</p>
                  </td>
                  <td className="px-4 py-3 text-muted" data-where>{proximity(a, profile).label}<span className="block text-xs">{a.mode}</span></td>
                  <td className="whitespace-nowrap px-4 py-3" data-pay>{formatSalary(salaryOf(a)) || <span className="text-muted">Not listed</span>}</td>
                  <td className="px-4 py-3"><Score value={a.score} /></td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                    {a.applied_at && <p className="mt-1 text-xs text-muted">Deleted {deleteOn(a.applied_at)}</p>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{a.updated_at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
