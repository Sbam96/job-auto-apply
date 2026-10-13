// Job sources (SR-01 to SR-05). Each turns its own format into one Job shape.
// The network is injected (`fetchImpl`), so tests use saved samples instead of the internet.

import type { EmploymentType } from "../config";
import { atsFromUrl } from "../route";
import type { Job, Salary } from "../types";
import { htmlToText } from "./html";

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface Board { ats: "greenhouse" | "lever" | "ashby"; board: string; company: string }

async function getJson(fetchImpl: FetchLike, url: string) {
  const res = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": "job-auto-apply/0.1 (personal job search)" } });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

// ---------- Remotive (SR-01) ----------
const REMOTIVE_TYPES: Record<string, EmploymentType> = { full_time: "permanent", contract: "contract", part_time: "part-time", freelance: "contract", internship: "internship" };

// Remotive's salary is free text, e.g. "$90k - $120k" or "£50,000-£60,000".
export function parseSalaryText(text: string | null | undefined): Salary | null {
  const t = String(text ?? "");
  if (!t.trim()) return null;
  const currency = /£|gbp/i.test(t) ? "GBP" : /€|eur/i.test(t) ? "EUR" : /cad|c\$/i.test(t) ? "CAD" : /\$|usd/i.test(t) ? "USD" : null;
  const nums = [...t.matchAll(/(\d[\d,.]*)\s*(k)?/gi)].map((m) => {
    const n = Number(m[1].replace(/,/g, ""));
    return m[2] ? n * 1000 : n;
  }).filter((n) => n > 0);
  if (!nums.length) return null;
  return { min: Math.min(...nums), max: Math.max(...nums), currency };
}

export function normaliseRemotive(data: { jobs?: unknown[] }): Job[] {
  return (data.jobs ?? []).map((raw) => {
    const j = raw as Record<string, string | number>;
    const url = String(j.url ?? "");
    return {
      source: "remotive",
      sourceId: String(j.id),
      company: String(j.company_name ?? ""),
      title: String(j.title ?? ""),
      // Remotive is remote-only; candidate_required_location says where from.
      location: `Remote - ${j.candidate_required_location || "Anywhere"}`,
      remote: true,
      url,
      description: htmlToText(String(j.description ?? "")),
      employmentType: REMOTIVE_TYPES[String(j.job_type)] ?? null,
      salary: parseSalaryText(String(j.salary ?? "")),
      postedAt: j.publication_date ? String(j.publication_date) : null,
      ats: atsFromUrl(url),
      attribution: `Found on Remotive: ${url}`,
    } satisfies Job;
  });
}

// ---------- Greenhouse (SR-02) ----------
export function normaliseGreenhouse(data: { jobs?: unknown[] }, board: Board): Job[] {
  return (data.jobs ?? []).map((raw) => {
    const j = raw as { id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; updated_at?: string; first_published?: string; company_name?: string };
    const location = j.location?.name ?? "";
    return {
      source: "greenhouse",
      sourceId: `${board.board}:${j.id}`,
      company: board.company || j.company_name || board.board,
      title: j.title,
      location,
      remote: /remote/i.test(location),
      url: j.absolute_url,
      description: htmlToText(j.content ?? ""),
      employmentType: null,
      salary: null,
      postedAt: j.first_published ?? j.updated_at ?? null,
      ats: "greenhouse",
      attribution: null,
    } satisfies Job;
  });
}

// ---------- Lever (SR-03) ----------
const LEVER_TYPES: [RegExp, EmploymentType][] = [[/intern/i, "internship"], [/part/i, "part-time"], [/fixed|temporary|temp\b/i, "fixed-term"], [/contract|freelance/i, "contract"], [/full|permanent|regular/i, "permanent"]];

export function normaliseLever(data: unknown[], board: Board): Job[] {
  return (data ?? []).map((raw) => {
    const j = raw as { id: string; text: string; hostedUrl: string; applyUrl?: string; descriptionPlain?: string; additionalPlain?: string; lists?: { text: string; content: string }[]; categories?: { location?: string; commitment?: string; allLocations?: string[] }; workplaceType?: string; salaryRange?: { min?: number; max?: number; currency?: string }; createdAt?: number };
    const locs = j.categories?.allLocations?.length ? j.categories.allLocations : [j.categories?.location ?? ""];
    const location = [j.workplaceType === "remote" ? "Remote" : j.workplaceType === "hybrid" ? "Hybrid" : "", locs.join(" / ")].filter(Boolean).join(" - ");
    const commitment = j.categories?.commitment ?? "";
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    return {
      source: "lever",
      sourceId: `${board.board}:${j.id}`,
      company: board.company || board.board,
      title: j.text,
      location,
      remote: j.workplaceType === "remote",
      url: j.hostedUrl,
      description: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n").trim(),
      employmentType: LEVER_TYPES.find(([re]) => re.test(commitment))?.[1] ?? null,
      salary: j.salaryRange ? { min: num(j.salaryRange.min), max: num(j.salaryRange.max), currency: j.salaryRange.currency ?? null } : null,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      ats: "lever",
      attribution: null,
    } satisfies Job;
  });
}

// ---------- Ashby (SR-04) ----------
const ASHBY_TYPES: Record<string, EmploymentType> = { FullTime: "permanent", PartTime: "part-time", Intern: "internship", Contract: "contract", Temporary: "fixed-term" };

export function normaliseAshby(data: { jobs?: unknown[] }, board: Board): Job[] {
  return (data.jobs ?? []).filter((raw) => (raw as { isListed?: boolean }).isListed !== false).map((raw) => {
    const j = raw as { id: string; title: string; location?: string; secondaryLocations?: { location?: string }[]; employmentType?: string; isRemote?: boolean; workplaceType?: string; descriptionPlain?: string; descriptionHtml?: string; jobUrl: string; applyUrl?: string; publishedAt?: string; compensation?: { summaryComponents?: { compensationType?: string; minValue?: number; maxValue?: number; currencyCode?: string }[] } };
    const places = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter(Boolean).join(" / ");
    const remote = j.isRemote === true || j.workplaceType === "Remote";
    const pay = j.compensation?.summaryComponents?.find((c) => c.compensationType === "Salary");
    return {
      source: "ashby",
      sourceId: `${board.board}:${j.id}`,
      company: board.company || board.board,
      title: j.title,
      location: [remote ? "Remote" : j.workplaceType === "Hybrid" ? "Hybrid" : "", places].filter(Boolean).join(" - "),
      remote,
      url: j.jobUrl,
      description: j.descriptionPlain ?? htmlToText(j.descriptionHtml ?? ""),
      employmentType: ASHBY_TYPES[j.employmentType ?? ""] ?? null,
      salary: pay ? { min: num(pay.minValue), max: num(pay.maxValue), currency: pay.currencyCode ?? null } : null,
      postedAt: j.publishedAt ?? null,
      ats: "ashby",
      attribution: null,
    } satisfies Job;
  });
}

export const boardUrl = (b: Board) =>
  b.ats === "greenhouse" ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b.board)}/jobs?content=true`
  : b.ats === "lever" ? `https://api.lever.co/v0/postings/${encodeURIComponent(b.board)}?mode=json`
  : `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b.board)}?includeCompensation=true`;

export const REMOTIVE_URL = "https://remotive.com/api/remote-jobs";

export async function fetchBoard(b: Board, fetchImpl: FetchLike = fetch): Promise<Job[]> {
  const data = await getJson(fetchImpl, boardUrl(b));
  if (b.ats === "greenhouse") return normaliseGreenhouse(data, b);
  if (b.ats === "lever") return normaliseLever(data, b);
  return normaliseAshby(data, b);
}

export async function fetchRemotive(fetchImpl: FetchLike = fetch): Promise<Job[]> {
  return normaliseRemotive(await getJson(fetchImpl, REMOTIVE_URL));
}

// SR-01 / SR-05: fetch every source within its daily limit; one failure doesn't stop the rest.
export interface SourceRun { jobs: Job[]; errors: { source: string; error: string }[]; skipped: string[] }

export async function fetchAll(
  boards: Board[],
  opts: { fetchImpl?: FetchLike; canFetch: (key: string, source: string) => Promise<boolean>; recordFetch: (key: string, source: string) => Promise<void>; includeRemotive?: boolean },
): Promise<SourceRun> {
  const out: SourceRun = { jobs: [], errors: [], skipped: [] };
  const tasks: { key: string; source: string; run: () => Promise<Job[]> }[] = [];
  if (opts.includeRemotive !== false) tasks.push({ key: "remotive", source: "remotive", run: () => fetchRemotive(opts.fetchImpl) });
  for (const b of boards) tasks.push({ key: `${b.ats}:${b.board}`, source: b.ats, run: () => fetchBoard(b, opts.fetchImpl) });
  for (const t of tasks) {
    if (!(await opts.canFetch(t.key, t.source))) { out.skipped.push(t.key); continue; }
    try {
      await opts.recordFetch(t.key, t.source);
      out.jobs.push(...(await t.run()));
    } catch (err) {
      out.errors.push({ source: t.key, error: (err as Error).message });
    }
  }
  return out;
}
