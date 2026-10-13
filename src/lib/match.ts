// Matching (MT-01 to MT-07). Hard filters first, then a 0–100 score.
// Pure: the clock is passed in as `now`, so tests run instantly.

import { APPLY_THRESHOLD, SENIORITY, type EmploymentType, type Region, type Seniority, type WorkMode } from "./config";
import { matchLocation, parseLocation, type ParsedLocation } from "./location";
import { skillsIn } from "./skills";
import type { Job, Profile } from "./types";
import { usableSkills } from "./cv";

// MT-05: titles that count as the same job family.
const TITLE_FAMILIES: string[][] = [
  ["business analyst", "business systems analyst", "systems analyst", "it business analyst", "requirements analyst", "functional analyst", "process analyst", "business process analyst", "technical business analyst", "digital business analyst", "product analyst", "business analysis"],
  ["product analyst", "product owner", "associate product manager", "product operations analyst"],
  ["data analyst", "business intelligence analyst", "bi analyst", "reporting analyst", "insights analyst", "analytics analyst"],
  ["consultant", "business consultant", "management consultant", "technology consultant", "associate consultant", "functional consultant", "transformation consultant"],
  ["project manager", "project coordinator", "delivery manager", "programme manager", "program manager"],
];

const SENIORITY_WORDS: [RegExp, Seniority][] = [
  [/\b(intern|internship|placement|apprentice)\b/i, "intern"],
  [/\b(junior|jr\.?|graduate|entry[- ]level|associate)\b/i, "junior"],
  [/\b(principal|head of|director|vp|vice president)\b/i, "principal"],
  [/\b(lead|staff|manager)\b/i, "lead"],
  [/\b(senior|sr\.?)\b/i, "senior"],
];

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const stripLevel = (title: string) => norm(title).replace(/\b(junior|jr|senior|sr|lead|principal|staff|graduate|associate|entry level|i{1,3}|iv|1|2|3)\b/g, " ").replace(/\s+/g, " ").trim();

export function seniorityOf(title: string): Seniority {
  // "Associate Consultant" and "Product Manager" are titles, not levels, so check the rest of the title too.
  for (const [re, level] of SENIORITY_WORDS) {
    if (!re.test(title)) continue;
    if (level === "lead" && /\bproduct manager|project manager|programme manager|program manager|delivery manager\b/i.test(title) && !/\b(lead|staff)\b/i.test(title)) continue;
    return level;
  }
  return "mid";
}

// MT-03: between the lowest and highest level the user picked (default mid to lead).
export function seniorityFits(jobLevel: Seniority, min: Seniority, max: Seniority = min) {
  const j = SENIORITY.indexOf(jobLevel);
  const lo = SENIORITY.indexOf(min);
  const hi = Math.max(lo, SENIORITY.indexOf(max));
  return j >= lo && j <= hi;
}

// MT-05: exact target title, a similar title from the same family, or no match.
export function titleMatch(title: string, targets: string[]): "exact" | "similar" | null {
  const t = stripLevel(title);
  let best: "exact" | "similar" | null = null;
  for (const target of targets) {
    const k = stripLevel(target);
    if (!k) continue;
    if (t.includes(k)) return "exact";
    const family = TITLE_FAMILIES.find((f) => f.some((x) => x === k || k.includes(x) || x.includes(k)));
    if (family?.some((x) => t.includes(x))) best = "similar";
  }
  return best;
}

// MT-02: work out the employment type when the source doesn't say.
export function employmentTypeOf(job: Pick<Job, "employmentType" | "title" | "description">): EmploymentType {
  if (job.employmentType) return job.employmentType;
  const t = `${job.title} ${job.description}`.toLowerCase();
  if (/\b(intern|internship)\b/.test(job.title.toLowerCase())) return "internship";
  if (/fixed[- ]term|maternity cover|\b\d{1,2}[- ]month contract\b|ftc\b/.test(t)) return "fixed-term";
  if (/\b(contract role|contractor|freelance|b2b|day rate|outside ir35|inside ir35|1099)\b/.test(t) || /\bcontract\b/.test(job.title.toLowerCase())) return "contract";
  if (/\bpart[- ]time\b/.test(job.title.toLowerCase())) return "part-time";
  return "permanent";
}

// MT-04: annual pay in the job's currency. Small numbers are hourly or day rates.
function annual(n: number) {
  if (n < 200) return n * 2000; // hourly
  if (n < 2000) return n * 230; // daily
  return n;
}

export function payFits(job: Pick<Job, "salary">, floor: Profile["salaryFloor"]): boolean {
  const s = job.salary;
  if (!s || (s.min == null && s.max == null)) return true; // pay not listed: passes
  const top = annual((s.max ?? s.min) as number);
  if (s.currency === "USD" && floor.usd) return top >= floor.usd;
  if (s.currency === "GBP" && floor.gbp) return top >= floor.gbp;
  return true; // a currency there's no floor for
}

export function yearsOfExperience(profile: Pick<Profile, "experience">, now: Date): number {
  // Merge overlapping roles so two jobs at once don't count twice.
  const spans = profile.experience
    .map((r) => [monthIndex(r.start), r.end ? monthIndex(r.end) : now.getUTCFullYear() * 12 + now.getUTCMonth()] as [number, number])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((x, y) => x[0] - y[0]);
  let months = 0;
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (!cur || s[0] > cur[1]) { if (cur) months += cur[1] - cur[0]; cur = [...s]; }
    else cur[1] = Math.max(cur[1], s[1]);
  }
  if (cur) months += cur[1] - cur[0];
  return Math.round((months / 12) * 10) / 10;
}
const monthIndex = (ym: string) => { const [y, m] = String(ym).split("-").map(Number); return y * 12 + (m - 1); };

export function requiredYears(description: string): number | null {
  const m = String(description).match(/(\d{1,2})\s*\+?\s*(?:-\s*\d{1,2}\s*)?(?:years|yrs)(?:'|’)?\s*(?:of\s+)?(?:relevant\s+|professional\s+|proven\s+)?(?:experience|exp)/i);
  return m ? Number(m[1]) : null;
}

export interface ScoreBreakdown { title: number; skills: number; experience: number; domain: number; total: number; matchedSkills: string[]; missingSkills: string[] }

// MT-06: 0–100. Title 30, skills 45, experience 15, domain 10.
export function scoreJob(job: Job, profile: Profile, now: Date, titleKind: "exact" | "similar"): ScoreBreakdown {
  const title = titleKind === "exact" ? 30 : 22;
  const cvText = `${profile.summary} ${profile.experience.map((r) => `${r.title} ${r.bullets.filter((b) => b.status === "approved").map((b) => b.text).join(" ")}`).join(" ")}`;
  // A skill counts if it's on the CV, ticked in the skills bank, or shown in approved CV text.
  const mine = new Set([...usableSkills(profile).map((s) => s.toLowerCase()), ...skillsIn(cvText)]);
  const wanted = skillsIn(`${job.title} ${job.description}`, [...mine]);
  const matched = wanted.filter((s) => mine.has(s));
  const missing = wanted.filter((s) => !mine.has(s));
  // Full marks once you match most of what a job asks for; a long wish-list of tools doesn't sink the score.
  const enough = Math.max(3, Math.ceil(wanted.length * 0.6));
  const skills = wanted.length ? Math.round(Math.min(1, matched.length / enough) * 45) : 27;
  const need = requiredYears(job.description);
  const have = yearsOfExperience(profile, now);
  // MT-08: roles asking for more than you have, but within your stretch limit, still score well.
  const experience = need == null ? 12 : have >= need ? 15 : 11;
  const domainWords = ["insurance", "pensions", "wealth", "financial services", "banking", "public sector", "government", "data strategy", "regulatory", "compliance", "consulting"];
  const myText = `${profile.experience.map((r) => `${r.employer} ${r.title} ${r.bullets.filter((b) => b.status === "approved").map((b) => b.text).join(" ")}`).join(" ")} ${profile.summary}`.toLowerCase();
  const desc = job.description.toLowerCase();
  const shared = domainWords.filter((w) => desc.includes(w) && myText.includes(w));
  const domain = Math.min(10, shared.length * 5);
  const total = Math.min(100, title + skills + experience + domain);
  return { title, skills, experience, domain, total, matchedSkills: matched, missingSkills: missing };
}

// MT-07: one application per role per location variant.
export function dedupeKey(job: Pick<Job, "company" | "title">, region: Region): string {
  return `${norm(job.company)}|${stripLevel(job.title)}|${seniorityOf(job.title)}|${region}`;
}

export type Evaluation =
  | { pass: false; stage: "location" | "title" | "type" | "seniority" | "experience" | "pay" | "score"; reason: string; score?: ScoreBreakdown }
  | { pass: true; region: Region; mode: WorkMode; place: ParsedLocation; score: ScoreBreakdown; titleKind: "exact" | "similar"; key: string };

// Every hard filter, then the score.
export function evaluate(job: Job, profile: Profile, now: Date): Evaluation {
  const place = parseLocation(job.location, { remote: job.remote });
  const loc = matchLocation(place, profile.locations);
  if (!loc.ok) return { pass: false, stage: "location", reason: loc.reason };
  const titleKind = titleMatch(job.title, profile.targetTitles);
  if (!titleKind) return { pass: false, stage: "title", reason: "title not in your target list" };
  const type = employmentTypeOf(job);
  if (!profile.employmentTypes.includes(type)) return { pass: false, stage: "type", reason: `${type} not wanted` };
  const level = seniorityOf(job.title);
  if (!seniorityFits(level, profile.seniority, profile.seniorityMax)) return { pass: false, stage: "seniority", reason: `${level} level` };
  const need = requiredYears(job.description);
  if (need != null && need > (profile.maxYearsAsked ?? 8)) return { pass: false, stage: "experience", reason: `asks for ${need}+ years` };
  if (!payFits(job, profile.salaryFloor)) return { pass: false, stage: "pay", reason: "below your pay floor" };
  const score = scoreJob(job, profile, now, titleKind);
  const threshold = profile.thresholds?.apply ?? APPLY_THRESHOLD;
  if (score.total < threshold) return { pass: false, stage: "score", reason: `scored ${score.total}`, score };
  return { pass: true, region: loc.region, mode: loc.mode, place, score, titleKind, key: dedupeKey(job, loc.region) };
}
