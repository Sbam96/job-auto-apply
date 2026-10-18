// SC-01: the scheduled search. GitHub Actions calls this every hour with CRON_SECRET; each user is
// searched for when their chosen gap (every 6 hours to once a week) has passed. ?force=1 searches
// everyone now.
import { getDb } from "@/lib/db";
import { cronAuthorised, json } from "@/lib/http";
import { llmFromEnv } from "@/lib/llm";
import { londonDay, runSearch, searchDue } from "@/lib/pipeline";
import { lastSearch, PgPipelineStore } from "@/lib/store";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return json({ error: "unauthorised" }, 401);
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const db = await getDb();
  const everyone = await new PgPipelineStore(db, londonDay(now)).activeUsers();
  const due: string[] = [];
  for (const u of everyone) {
    if (force || searchDue(u.profile.searchEvery, (await lastSearch(db, u.userId))?.at, now)) due.push(u.userId);
  }
  let created = 0;
  let fetched = 0;
  for (const userId of due) {
    const result = await runSearch({ store: new PgPipelineStore(db, londonDay(now), userId), llm: llmFromEnv(), now });
    created += result.created.length;
    fetched += result.fetched;
  }
  return json({ searched: due.length, waiting: everyone.length - due.length, fetched, created });
}
