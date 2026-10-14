import { blockCompanyAction, removeBoardAction, unblockCompanyAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getProfile, listBoards } from "@/lib/store";
import { Card, PageHeader, secondaryButtonClass } from "@/components/ui";
import { AddBoard } from "./AddBoard";

const ATS_NAME = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" } as const;

export default async function CompaniesPage() {
  const user = await requireUser();
  const db = await getDb();
  const [boards, profile] = await Promise.all([listBoards(db, user.id), getProfile(db, user.id)]);
  return (
    <>
      <PageHeader title="Companies" intro="Company job boards to check, alongside Remotive. Add companies that hire remotely or through an employer-of-record." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Watching ${boards.length}`} className="lg:col-span-2">
          <ul className="divide-y divide-line">
            {boards.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">{b.company}</p>
                  <p className="text-xs text-muted">{ATS_NAME[b.ats]} board &ldquo;{b.board}&rdquo;</p>
                </div>
                <form action={removeBoardAction}><input type="hidden" name="id" value={b.id} /><button className="text-sm text-muted hover:text-bad">Remove</button></form>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">Remotive is always checked too (up to 4 times a day, as its terms ask). Jobs found there are credited to Remotive.</p>
        </Card>
        <AddBoard />
      </div>

      <Card title="Blocked companies" className="mt-6">
        <p className="mb-4 text-sm text-muted">You&apos;re never matched with these employers. Block one from any match, or add it here.</p>
        {profile.blockedCompanies.length === 0 ? <p className="mb-4 text-sm text-muted">None blocked.</p> : (
          <ul className="mb-4 flex flex-wrap gap-2" data-blocked>
            {profile.blockedCompanies.map((c) => (
              <li key={c} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm">
                {c}
                <form action={unblockCompanyAction}><input type="hidden" name="company" value={c} /><button className="rounded-full px-2 text-muted hover:text-ink" aria-label={`Unblock ${c}`}>×</button></form>
              </li>
            ))}
          </ul>
        )}
        <form action={blockCompanyAction} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Company name<input name="company" className="input mt-1 w-64" maxLength={200} required /></label>
          <button className={secondaryButtonClass}>Block</button>
        </form>
      </Card>
    </>
  );
}
