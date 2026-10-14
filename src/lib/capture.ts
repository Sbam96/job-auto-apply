// EX-06: make a match from any job page you're on, so the extension can fill it.
// Reads what the page says, works out where the job is, scores it, and tailors a CV (and a cover
// letter when the rules call for one), just like a match found by the search.
import { type Region } from "./config";
import type { Db } from "./db";
import { atsFromUrl } from "./route";
import type { LLM } from "./llm";
import { countryIn, matchLocation, parseLocation } from "./location";
import { dedupeKey, scoreJob, titleMatch } from "./match";
import { asksForCoverLetter, type PipelineStore } from "./pipeline";
import { normUrl } from "./pagematch";
import { tailor } from "./tailor";
import type { Job, Profile } from "./types";
import { immigrationText, wantsCoverLetter } from "./workauth";
import { checkInjection } from "./injection";

export interface PageJob { url: string; title: string; company: string; location: string; description: string }

const COUNTRY_REGION: Record<string, Region> = { uk: "UK", us: "US", canada: "CA" };

// Where the job is: the user's own location settings first, then what the page names, else the UK.
export function placeFor(page: PageJob, profile: Profile) {
  const parsed = parseLocation(page.location || "", { remote: /remote/i.test(page.location) });
  const m = matchLocation(parsed, profile.locations);
  if (m.ok) return { region: m.region, mode: m.mode, countries: parsed.countries, guessed: false };
  const named = parsed.regions.find((r) => r !== "ANY") as Region | undefined;
  if (named) return { region: named, mode: parsed.mode, countries: parsed.countries, guessed: false };
  const c = countryIn(`${page.location} ${page.description.slice(0, 3000)}`);
  if (c) return { region: COUNTRY_REGION[c] ?? "EMEA", mode: parsed.mode, countries: c in COUNTRY_REGION ? [] : [c], guessed: true };
  return { region: "UK" as Region, mode: parsed.mode, countries: [], guessed: true };
}

export async function captureJob(deps: { db: Db; store: Pick<PipelineStore, "saveJobs" | "createApplication">; userId: string; profile: Profile; llm: LLM | null; now: Date }, page: PageJob) {
  const { db, store, userId, profile, llm, now } = deps;
  const title = page.title.trim().slice(0, 200);
  const company = page.company.trim().slice(0, 200) || new URL(page.url).hostname.replace(/^www\./, "");
  const job: Job = {
    source: "page", sourceId: normUrl(page.url), company, title, location: page.location || "Not stated", remote: /remote/i.test(page.location),
    url: page.url, description: page.description.slice(0, 20000), employmentType: null, salary: null, postedAt: null, ats: atsFromUrl(page.url), attribution: null,
  };
  const place = placeFor(page, profile);
  const key = dedupeKey(job, place.region);
  // Already a match for this role? Use it rather than making another.
  const existing = await db.query<{ id: number }>("SELECT id FROM applications WHERE user_id = $1 AND dedupe_key = $2 AND status = 'new' LIMIT 1", [userId, key]);
  if (existing.rows[0]) return { id: existing.rows[0].id, created: false };

  const ids = await store.saveJobs([job]);
  const jobId = ids.get(`page:${job.sourceId}`)!;
  const score = scoreJob(job, profile, now, titleMatch(job.title, profile.targetTitles) ?? "similar");
  const injection = checkInjection(job.description);
  const tailored = await tailor(profile, job, llm, {
    coverLetter: wantsCoverLetter(place, { required: asksForCoverLetter(job.description) }),
    immigrationText: immigrationText(place),
  });
  const flags = [
    "Added from the browser extension.",
    ...(place.guessed ? [`The page didn't say clearly where this job is based, so answers assume ${place.region === "EMEA" ? "Europe" : place.region}. Check the work authorisation answers.`] : []),
    ...(injection.flagged ? [`Possible prompt injection in the job text (${injection.matches.join(", ")}); it was removed and not followed.`] : []),
    ...tailored.warnings,
  ];
  const id = await store.createApplication({
    userId, jobId, dedupeKey: key, region: place.region, mode: place.mode, countries: place.countries,
    score: score.total, breakdown: score, flags, tailored,
  });
  return { id, created: true };
}

