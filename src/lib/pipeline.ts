// One search run: fetch sources, match each user, create applications with tailored documents.
// Every dependency is passed in (store, network, LLM, clock), so a whole run can be tested offline.

import { DAILY_APPLY_CAP, SOURCE_LIMITS, type Region, type Status, type WorkMode } from "./config";
import { checkInjection } from "./injection";
import type { LLM } from "./llm";
import { evaluate, type ScoreBreakdown } from "./match";
import { atsFromUrl, routeFor, type Route } from "./route";
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
  route: Route;
  status: Status;
  flags: string[];
  tailored: Tailored;
}

export interface PipelineStore {
  activeUsers(): Promise<{ userId: string; profile: Profile }[]>;
  allBoards(): Promise<Board[]>;
  fetchCount(key: string, day: string): Promise<number>;
  recordFetch(key: string, day: string): Promise<void>;
  saveJobs(jobs: Job[]): Promise<Map<string, number>>; // "source:sourceId" -> job id
  hasApplication(userId: string, dedupeKey: string): Promise<boolean>;
  createdOn(userId: string, day: string): Promise<number>;
  createApplication(app: NewApplication): Promise<number>;
}

export interface RunResult {
  fetched: number;
  sourceErrors: { source: string; error: string }[];
  skippedSources: string[];
  created: { userId: string; applicationId: number; route: Route; title: string; company: string }[];
  rejected: Record<string, number>; // why jobs didn't match, by stage
}

export const londonDay = (now: Date) => now.toLocaleDateString("en-CA", { timeZone: "Europe/London" }); // YYYY-MM-DD

export async function runSearch(deps: { store: PipelineStore; llm: LLM | null; now: Date; fetchImpl?: typeof fetch; includeRemotive?: boolean }): Promise<RunResult> {
  const { store, llm, now } = deps;
  const day = londonDay(now);
  const boards = await store.allBoards();
  const run = await fetchAll(boards, {
    fetchImpl: deps.fetchImpl,
    includeRemotive: deps.includeRemotive,
    canFetch: async (key, source) => (await store.fetchCount(key, day)) < (SOURCE_LIMITS[source]?.perDay ?? 4), // SR-01
    recordFetch: (key) => store.recordFetch(key, day),
  });
  const ids = await store.saveJobs(run.jobs);
  const result: RunResult = { fetched: run.jobs.length, sourceErrors: run.errors, skippedSources: run.skipped, created: [], rejected: {} };

  // Newest jobs first, so the daily cap goes on the freshest roles.
  const jobs = [...run.jobs].sort((a, b) => String(b.postedAt ?? "").localeCompare(String(a.postedAt ?? "")));

  for (const { userId, profile } of await store.activeUsers()) {
    let made = await store.createdOn(userId, day);
    const seen = new Set<string>();
    for (const job of jobs) {
      if (made >= DAILY_APPLY_CAP) break;
      const ev = evaluate(job, profile, now);
      if (!ev.pass) { result.rejected[ev.stage] = (result.rejected[ev.stage] ?? 0) + 1; continue; }
      // MT-07: the same role twice in one run, or already applied to.
      if (seen.has(ev.key) || (await store.hasApplication(userId, ev.key))) { result.rejected.duplicate = (result.rejected.duplicate ?? 0) + 1; continue; }
      seen.add(ev.key);
      const jobId = ids.get(`${job.source}:${job.sourceId}`);
      if (!jobId) continue;

      const injection = checkInjection(job.description); // TL-04
      const ats = job.ats ?? atsFromUrl(job.url);
      const route = routeFor({ score: ev.score.total, ats, flagged: injection.flagged, autoThreshold: profile.thresholds.auto });
      const place = { region: ev.region, mode: ev.mode, countries: ev.place.countries };
      const tailored = await tailor(profile, job, llm, {
        coverLetter: wantsCoverLetter(place), // AP-04
        immigrationText: immigrationText(place), // WA-05
      });
      const flags = [
        ...(injection.flagged ? [`Possible prompt injection in the job text (${injection.matches.join(", ")}); it was removed and not followed.`] : []),
        ...tailored.warnings,
      ];
      const applicationId = await store.createApplication({
        userId, jobId, dedupeKey: ev.key, region: ev.region, mode: ev.mode, countries: ev.place.countries,
        score: ev.score.total, breakdown: ev.score, route,
        status: route === "auto" ? "queued" : "needs_approval",
        flags, tailored,
      });
      made += 1;
      result.created.push({ userId, applicationId, route, title: job.title, company: job.company });
    }
  }
  return result;
}
