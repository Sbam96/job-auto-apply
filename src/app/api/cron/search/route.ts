// The scheduled search. Called every few hours by GitHub Actions with CRON_SECRET.
import { getDb } from "@/lib/db";
import { cronAuthorised, json } from "@/lib/http";
import { llmFromEnv } from "@/lib/llm";
import { londonDay, runSearch } from "@/lib/pipeline";
import { PgPipelineStore } from "@/lib/store";

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return json({ error: "unauthorised" }, 401);
  const now = new Date();
  const result = await runSearch({ store: new PgPipelineStore(await getDb(), londonDay(now)), llm: llmFromEnv(), now });
  return json({ fetched: result.fetched, created: result.created.length, rejected: result.rejected, sourceErrors: result.sourceErrors, skippedSources: result.skippedSources });
}
