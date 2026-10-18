// SO-01 to SO-03: sorting matches by match score, pay, or how close the job is to you. Pure.
import { annual } from "./match";
import { cityKey, parseLocation } from "./location";
import type { Profile, Salary } from "./types";

export const SORTS = [
  { key: "newest", label: "Newest" },
  { key: "match", label: "Best match" },
  { key: "salary", label: "Highest pay" },
  { key: "proximity", label: "Closest to you" },
] as const;
export type SortKey = (typeof SORTS)[number]["key"];

// Rough rates to put pay in different currencies on one scale (GBP). Only used for ordering.
const TO_GBP: Record<string, number> = { GBP: 1, USD: 0.77, EUR: 0.85, CAD: 0.56 };

const AMOUNT = String.raw`(\d{2,3}(?:,\d{3})+|\d{2,3}(?:\.\d)?\s?k)`;
const SALARY_IN_TEXT = new RegExp(String.raw`(£|\$|€|USD|GBP|EUR|CAD|C\$)\s?${AMOUNT}(?:\s*(?:-|–|—|to)\s*(?:£|\$|€|USD|GBP|EUR|CAD|C\$)?\s?${AMOUNT})?`, "i");
const money = (s: string) => { const k = /k/i.test(s); const n = Number(s.replace(/[^\d.]/g, "")); return k ? n * 1000 : n; };
const CURRENCY: Record<string, string> = { "£": "GBP", gbp: "GBP", "$": "USD", usd: "USD", "€": "EUR", eur: "EUR", cad: "CAD", "c$": "CAD" };

// Pay as listed by the job board, or else the first pay range written in the job description.
export function salaryOf(job: { salary: Salary | null; description?: string }): Salary | null {
  if (job.salary && (job.salary.min != null || job.salary.max != null)) return job.salary;
  const m = String(job.description ?? "").match(SALARY_IN_TEXT);
  if (!m) return null;
  const min = money(m[2]);
  const max = m[3] ? money(m[3]) : min;
  if (!min || min < 10) return null;
  return { min, max, currency: CURRENCY[m[1].toLowerCase()] ?? null };
}

// The top of the range, a year, in pounds (approximately). Null when pay isn't listed.
export function annualGbp(s: Salary | null): number | null {
  if (!s) return null;
  const top = s.max ?? s.min;
  if (top == null) return null;
  return Math.round(annual(top) * (TO_GBP[s.currency ?? "GBP"] ?? 1));
}

const k = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const SYMBOL: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", CAD: "C$" };
export function formatSalary(s: Salary | null): string {
  if (!s) return "";
  const sym = SYMBOL[s.currency ?? ""] ?? "";
  const lo = s.min != null ? `${sym}${k(s.min)}` : "";
  const hi = s.max != null && s.max !== s.min ? `${sym}${k(s.max)}` : "";
  return [lo, hi].filter(Boolean).join("–");
}

// How close a job is to you, lower is closer:
// 0 hybrid or on-site in your city · 1 remote from the UK · 2 elsewhere in the UK ·
// 3 Europe and beyond (EMEA) · 4 Canada · 5 United States
export function proximity(job: { region: string; mode: string; location: string }, profile: Pick<Profile, "homeCity" | "locations">): { rank: number; label: string } {
  const homes = [profile.homeCity.split(",")[0], ...profile.locations.flatMap((l) => (l.region === "UK" ? l.cities : []))].filter(Boolean).map(cityKey);
  const cities = parseLocation(job.location).cities;
  if (job.mode !== "remote" && cities.some((c) => homes.includes(c))) return { rank: 0, label: "In your city" };
  if (job.region === "UK") return job.mode === "remote" ? { rank: 1, label: "Remote, UK" } : { rank: 2, label: "Elsewhere in the UK" };
  if (job.region === "EMEA") return { rank: 3, label: "Europe / EMEA" };
  if (job.region === "CA") return { rank: 4, label: "Canada" };
  return { rank: 5, label: "United States" };
}

interface Sortable { score: number; created_at: Date; salary: Salary | null; description: string; region: string; mode: string; location: string }

export function sortMatches<T extends Sortable>(rows: T[], key: SortKey, profile: Pick<Profile, "homeCity" | "locations">): T[] {
  const out = [...rows];
  const newest = (a: T, b: T) => b.created_at.getTime() - a.created_at.getTime();
  if (key === "match") return out.sort((a, b) => b.score - a.score || newest(a, b));
  if (key === "salary") {
    // Unlisted pay goes last.
    const pay = (r: T) => annualGbp(salaryOf(r)) ?? -1;
    return out.sort((a, b) => pay(b) - pay(a) || b.score - a.score);
  }
  if (key === "proximity") return out.sort((a, b) => proximity(a, profile).rank - proximity(b, profile).rank || b.score - a.score);
  return out.sort(newest);
}
