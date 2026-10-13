import { removeBoardAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listBoards } from "@/lib/store";
import { Card, PageHeader } from "@/components/ui";
import { AddBoard } from "./AddBoard";

const ATS_NAME = { greenhouse: "Greenhouse", lever: "Lever", ashby: "Ashby" } as const;

export default async function CompaniesPage() {
  const user = await requireUser();
  const boards = await listBoards(await getDb(), user.id);
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
    </>
  );
}
