// One search run: fetch sources, match each user, and prepare a tailored CV (and cover letter when
// needed) for each match, ready for the user to download and apply with.
// Every dependency is passed in (store, network, LLM, clock), so a whole run can be tested offline.

import { DAILY_MATCH_CAP, REMATCH_AFTER_DAYS, SOURCE_LIMITS, type Region, type WorkMode } from "./config";
import { checkInjection } from "./injection";
import type { LLM } from "./llm";
import { evaluate, type ScoreBreakdown } from "./match";
import { findDirectLink, isAggregator, type DirectLink } from "./direct";
import { fetchAll, type Board } from "./sources";
import { tailor, type Tailored } from "./tailor";
import type { Job, Profile } from "./types";
import { immigrationText, wantsCoverLetter } from "./workauth";

export interface NewApplication {
  userId: string;
  jobId: number;
  dedupeKey: string;
  region: Region;
  mode: WorkMode;
  countries: string[];
  score: number;
  breakdown: ScoreBreakdown;
  flags: string[];
  tailored: Tailored;
}

export interface PipelineStore {
  activeUsers(): Promise<{ userId: string; profile: Profile }[]>;
  allBoards(): Promise<Board[]>;
  fetchCount(key: string, day: string): Promise<number>;
  recordFetch(key: string, day: string): Promise<void>;
  saveJobs(jobs: Job[]): Promise<Map<string, number>>; // "source:sourceId" -> job id
  // MT-07: an open match for this role, or one applied to after `appliedSince`.
  hasApplication(userId: string, dedupeKey: string, appliedSince: Date): Promise<boolean>;
  createdOn(userId: string, day: string): Promise<number>;
  createApplication(app: NewApplication): Promise<number>;
  recordRun?(userId: string, summary: UserRunSummary): Promise<void>;
  saveDirectLink?(jobId: number, link: DirectLink | null): Promise<void>;
}

// What one search found for one user: shown on the dashboard so filtering is never a mystery.
export interface UserRunSummary { at: string; checked: number; matched: number; rejected: Record<string, number>; sourceErrors: number; skippedSources: number }

export interface RunResult {
  fetched: number;
  sourceErrors: { source: string; error: string }[];
  skippedSources: string[];
  created: { userId: string; applicationId: number; title: string; company: string }[];
  rejected: Record<string, number>; // why jobs didn't match, by stage
}

// BL-01: company names compared loosely ("Acme Inc." blocks "ACME").
export const companyKey = (name: string) => String(name ?? "").toLowerCase().replace(/\b(inc|ltd|llc|limited|plc|corp|corporation|gmbh|co)\b\.?/g, "").replace(/[^a-z0-9]+/g, "");

// AP-04: a cover letter is written when the job asks for one.
export const asksForCoverLetter = (description: string) => /\b(cover(ing)? letter|letter of (motivation|interest)|motivation letter)\b/i.test(String(description ?? ""));

// SC-01: is this user's next search due? A little slack so an hourly scheduler that runs a few
// minutes early or late doesn't skip a whole cycle.
export function searchDue(everyHours: number, lastAt: string | Date | null | undefined, now: Date) {
  if (!lastAt) return true;
  const last = new Date(lastAt).getTime();
  if (!Number.isFinite(last)) return true;
  return now.getTime() - last >= everyHours * 3600000 - 20 * 60000;
}

export const londonDay = (now: Date) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

export async function runSearch(deps: { store: PipelineStore; llm: LLM | null; now: Date; fetchImpl?: typeof fetch; includeRemotive?: boolean; includeAggregators?: boolean }): Promise<RunResult> {
  const { store, llm, now } = deps;
  const day = londonDay(now);
  const boards = await store.allBoards();
  const users = await store.activeUsers();
  const run = await fetchAll(boards, {
    fetchImpl: deps.fetchImpl,
    includeRemotive: deps.includeRemotive,
    includeAggregators: deps.includeAggregators,
    queries: users.flatMap((u) => u.profile.targetTitles),
    canFetch: async (key, source) => (await store.fetchCount(key, day)) < (SOURCE_LIMITS[source]?.perDay ?? 4), // SR-01
    recordFetch: (key) => store.recordFetch(key, day),
  });
  const ids = await store.saveJobs(run.jobs);
  const result: RunResult = { fetched: run.jobs.length, sourceErrors: run.errors, skippedSources: run.skipped, created: [], rejected: {} };

  const directChecked = new Set<number>();
  // Newest jobs first, so the daily cap goes on the freshest roles.
  const jobs = [...run.jobs].sort((a, b) => String(b.postedAt ?? "").localeCompare(String(a.postedAt ?? "")));

  for (const { userId, profile } of users) {
    let made = await store.createdOn(userId, day);
    const blocked = new Set((profile.blockedCompanies ?? []).map(companyKey));
    const appliedSince = new Date(now.getTime() - REMATCH_AFTER_DAYS * 86400000);
    const seen = new Set<string>();
    const mine: Record<string, number> = {};
    const reject = (stage: string) => { result.rejected[stage] = (result.rejected[stage] ?? 0) + 1; mine[stage] = (mine[stage] ?? 0) + 1; };
    let matched = 0;
    for (const job of jobs) {
      if (made >= DAILY_MATCH_CAP) { reject("daily limit"); continue; }
      if (blocked.has(companyKey(job.company))) { reject("blocked"); continue; } // BL-01
      const ev = evaluate(job, profile, now);
      if (!ev.pass) { reject(ev.stage); continue; }
      // MT-07: the same role twice in one run, already matched, or applied to in the last 3 months.
      if (seen.has(ev.key) || (await store.hasApplication(userId, ev.key, appliedSince))) { reject("duplicate"); continue; }
      seen.add(ev.key);
      const jobId = ids.get(`${job.source}:${job.sourceId}`);
      if (!jobId) continue;

      const injection = checkInjection(job.description); // TL-04
      const place = { region: ev.region, mode: ev.mode, countries: ev.place.countries };
      const tailored = await tailor(profile, job, llm, {
        coverLetter: wantsCoverLetter(place, { required: asksForCoverLetter(job.description) }), // AP-04
        immigrationText: immigrationText(place), // WA-05
      });
      const flags = [
        ...(injection.flagged ? [`Possible prompt injection in the job text (${injection.matches.join(", ")}); it was removed and not followed.`] : []),
        ...tailored.warnings,
      ];
      const applicationId = await store.createApplication({
        userId, jobId, dedupeKey: ev.key, region: ev.region, mode: ev.mode, countries: ev.place.countries,
        score: ev.score.total, breakdown: ev.score,
        flags, tailored,
      });
      if (applicationId < 0) continue;
      // SR-08: job boards link to their own pages; look for the employer's own link once per job.
      if (isAggregator(job.source) && store.saveDirectLink && !directChecked.has(jobId)) {
        directChecked.add(jobId);
        await store.saveDirectLink(jobId, await findDirectLink(job, deps.fetchImpl ?? fetch));
      }
      made += 1;
      matched += 1;
      result.created.push({ userId, applicationId, title: job.title, company: job.company });
    }
    await store.recordRun?.(userId, { at: now.toISOString(), checked: jobs.length, matched, rejected: mine, sourceErrors: run.errors.length, skippedSources: run.skipped.length });
  }
  return result;
}
