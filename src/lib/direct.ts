// SR-08: the employer's own link for jobs found on job boards (Himalayas, Remote OK, Remotive).
// Those sites link to their own pages, and Himalayas makes you sign up before you can apply.
// So for each match we look for the same job on the employer's own careers site:
//   1. an application link already in the job text, then
//   2. the employer's public job board on Greenhouse, Lever, Ashby, Workable or SmartRecruiters,
//      matched by job title.
// If neither finds it, the app offers a search for the job on the employer's site instead.
import type { Job } from "./types";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const AGGREGATORS: readonly Job["source"][] = ["remotive", "himalayas", "remoteok"];
export const isAggregator = (source: string) => (AGGREGATORS as readonly string[]).includes(source);

const SOURCE_NAMES: Record<string, string> = { remotive: "Remotive", himalayas: "Himalayas", remoteok: "Remote OK" };
export const sourceName = (source: string) => SOURCE_NAMES[source] ?? source;

const ATS_LINK = /https?:\/\/[^\s"'<>)\]]*(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|myworkdayjobs\.com|recruitee\.com|bamboohr\.com|teamtailor\.com|jobs\.personio\.(?:de|com)|jobvite\.com|icims\.com|breezy\.hr|pinpointhq\.com|rippling\.com|workforcenow\.adp\.com)[^\s"'<>)\]]*/i;

// 1. A link to an applicant tracking system written into the job description.
export function linkInText(description: string): string | null {
  const m = String(description ?? "").match(ATS_LINK);
  return m ? m[0].replace(/[.,;]+$/, "") : null;
}

// "Rubicon Path Ltd." -> ["rubiconpath", "rubicon-path", "rubicon"]
export function slugCandidates(company: string): string[] {
  const words = String(company ?? "").toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(inc|ltd|llc|limited|plc|corp|corporation|gmbh|co|company|group|holdings)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return [...new Set([words.join(""), words.join("-"), words[0]])].filter((s) => s.length >= 3).slice(0, 3);
}

const normTitle = (t: string) => ` ${String(t ?? "").toLowerCase()} `
  .replace(/\b[a-z]{1,4}\d{3,}\b/g, " ") // requisition codes like RQ08223
  .replace(/\bsr\b\.?/g, "senior").replace(/\bjr\b\.?/g, "junior")
  .replace(/\([^)]*\)/g, (m) => m.replace(/[()]/g, " "))
  .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

// How alike two job titles are, 0 to 1 (shared words over all words).
export function titleSimilarity(a: string, b: string): number {
  const x = new Set(normTitle(a).split(" ").filter(Boolean));
  const y = new Set(normTitle(b).split(" ").filter(Boolean));
  if (!x.size || !y.size) return 0;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / new Set([...x, ...y]).size;
}

interface Posting { title: string; url: string }

// Each public job board: where to ask, and how to read the answer.
const BOARDS: { name: string; url: (slug: string) => string; read: (data: unknown, slug: string) => Posting[] }[] = [
  { name: "Greenhouse", url: (s) => `https://boards-api.greenhouse.io/v1/boards/${s}/jobs`, read: (d) => ((d as { jobs?: { title: string; absolute_url: string }[] }).jobs ?? []).map((j) => ({ title: j.title, url: j.absolute_url })) },
  { name: "Lever", url: (s) => `https://api.lever.co/v0/postings/${s}?mode=json`, read: (d) => (Array.isArray(d) ? d : []).map((j: { text: string; hostedUrl: string }) => ({ title: j.text, url: j.hostedUrl })) },
  { name: "Ashby", url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${s}`, read: (d) => ((d as { jobs?: { title: string; jobUrl: string }[] }).jobs ?? []).map((j) => ({ title: j.title, url: j.jobUrl })) },
  { name: "Workable", url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${s}`, read: (d) => ((d as { jobs?: { title: string; url?: string; shortlink?: string }[] }).jobs ?? []).map((j) => ({ title: j.title, url: j.url ?? j.shortlink ?? "" })) },
  { name: "SmartRecruiters", url: (s) => `https://api.smartrecruiters.com/v1/companies/${s}/postings`, read: (d, s) => ((d as { content?: { id: string; name: string }[] }).content ?? []).map((j) => ({ title: j.name, url: `https://jobs.smartrecruiters.com/${s}/${j.id}` })) },
];

const MATCH = 0.6; // title similarity needed to count as the same job

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface DirectLink { url: string; via: string }

export async function findDirectLink(job: Pick<Job, "title" | "company" | "description">, fetchImpl: FetchLike = fetch, timeoutMs = 6000): Promise<DirectLink | null> {
  const inText = linkInText(job.description);
  if (inText) return { url: inText, via: "the job description" };
  const probes = slugCandidates(job.company).flatMap((slug) => BOARDS.map((b) => ({ slug, b })));
  const results = await Promise.all(probes.map(async ({ slug, b }) => {
    const data = await getJson(fetchImpl, b.url(slug), timeoutMs);
    if (!data) return null;
    let best: (Posting & { score: number }) | null = null;
    for (const p of b.read(data, slug)) {
      if (!p.url) continue;
      const score = titleSimilarity(job.title, p.title);
      if (score >= MATCH && (!best || score > best.score)) best = { ...p, score };
    }
    return best ? { url: best.url, via: `${job.company}'s ${b.name} job board`, score: best.score } : null;
  }));
  const found = results.filter((r): r is NonNullable<typeof r> => !!r).sort((a, b) => b.score - a.score)[0];
  return found ? { url: found.url, via: found.via } : null;
}

// When there's no direct link: a web search for the job on the employer's site.
export const employerSearchUrl = (job: Pick<Job, "title" | "company">) =>
  `https://www.google.com/search?q=${encodeURIComponent(`"${job.company}" "${job.title.replace(/\b[A-Z]{1,4}\d{3,}\b\s*[-:]?\s*/g, "").trim()}" careers apply`)}`;
