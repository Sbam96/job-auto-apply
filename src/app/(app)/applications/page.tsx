import Link from "next/link";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listApplications } from "@/lib/store";
import { APPLIED_RETENTION_DAYS } from "@/lib/config";
import type { Status } from "@/lib/config";
import { Empty, PageHeader, Score, StatusBadge } from "@/components/ui";

const VIEWS: { key: string; label: string; statuses?: Status[] }[] = [
  { key: "ready", label: "Ready to apply", statuses: ["new"] },
  { key: "applied", label: "Applied", statuses: ["applied", "response", "interview", "offer"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "dismissed", "expired"] },
  { key: "all", label: "All" },
];

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requireUser();
  const { view = "ready" } = await searchParams;
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const apps = await listApplications(await getDb(), user.id, current.statuses);
  const deleteOn = (applied: Date) => new Date(applied.getTime() + APPLIED_RETENTION_DAYS * 86400000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <PageHeader title="Matches" intro="Every role the app matched for you, with a CV made for each. Applied ones are kept for 6 months, then deleted with their documents." />
      <div role="tablist" className="mb-5 flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} role="tab" aria-selected={v.key === current.key} href={`/applications?view=${v.key}`}
            className={`rounded-full border px-3 py-1 text-sm ${v.key === current.key ? "border-accent bg-accent-soft font-medium text-accent" : "border-line bg-surface text-muted hover:text-ink"}`}>
            {v.label}
          </Link>
        ))}
      </div>
      {apps.length === 0 ? (
        <Empty title={`Nothing in ${current.label.toLowerCase()}`} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-sm text-muted">
              <tr><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Location</th><th className="px-4 py-3 font-medium">Score</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Updated</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {apps.map((a) => (
                <tr key={a.id} className="hover:bg-canvas">
                  <td className="px-4 py-3">
                    <Link href={`/applications/${a.id}`} className="font-medium hover:text-accent">{a.title}</Link>
                    <p className="text-muted">{a.company}{a.flags.length > 0 && <span className="ml-2 text-warn" title={a.flags.join("\n")}>⚑ {a.flags.length} note{a.flags.length > 1 ? "s" : ""}</span>}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{a.region}, {a.mode}</td>
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
