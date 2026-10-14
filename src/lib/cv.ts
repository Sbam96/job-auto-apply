// The master CV: defaults, ordering and what the app may use from it (PR-01 to PR-05, TL-03).

import type { Bullet, Profile, Role } from "./types";

export function emptyProfile(): Profile {
  return {
    fullName: "",
    contactEmail: "",
    phone: "",
    homeCity: "",
    linkedin: "",
    portfolio: "",
    summary: "",
    targetTitles: ["Business Analyst"],
    seniority: "mid",
    seniorityMax: "senior",
    maxYearsAsked: 5,
    employmentTypes: ["permanent", "fixed-term"],
    salaryFloor: { usd: null, gbp: null },
    expectedSalary: { usd: null, gbp: null },
    noticePeriod: "",
    usHoursOverlap: "",
    locations: [
      { region: "US", modes: ["remote"], cities: [] },
      { region: "CA", modes: ["remote"], cities: [] },
      { region: "UK", modes: ["remote", "hybrid"], cities: [] },
      { region: "EMEA", modes: ["remote"], cities: [] },
    ],
    auth: { usSponsorship: true, canadaSponsorship: true },
    // PR-05: every self-ID question starts as "prefer not to say".
    selfId: { veteran: "prefer_not", disability: "prefer_not", race: "prefer_not", gender: "prefer_not" },
    writingSamples: [],
    experience: [],
    education: [],
    certifications: [],
    skills: [],
    thresholds: { apply: 75 },
    paused: false,
    blockedCompanies: [],
    savedAnswers: [],
    digest: { every: 1, hour: 8 },
  };
}

// Fills in anything missing from a stored profile, so older records keep working.
export function withDefaults(p: Partial<Profile> | null | undefined): Profile {
  const base = emptyProfile();
  if (!p) return base;
  return {
    ...base,
    ...p,
    salaryFloor: { ...base.salaryFloor, ...(p.salaryFloor ?? {}) },
    expectedSalary: { ...base.expectedSalary, ...(p.expectedSalary ?? {}) },
    auth: { ...base.auth, ...(p.auth ?? {}) },
    selfId: { ...base.selfId, ...(p.selfId ?? {}) },
    thresholds: { apply: p.thresholds?.apply ?? base.thresholds.apply },
    blockedCompanies: Array.isArray(p.blockedCompanies) ? p.blockedCompanies : [],
    savedAnswers: Array.isArray(p.savedAnswers) ? p.savedAnswers : [],
    digest: { ...base.digest, ...(p.digest ?? {}) },
  };
}

const ym = (s: string | null) => (s ? s : "9999-12"); // current role sorts first

// PR-01: reverse-chronological, current roles first.
export function orderedRoles(roles: Role[]): Role[] {
  return [...roles].sort((a, b) => ym(b.end).localeCompare(ym(a.end)) || b.start.localeCompare(a.start));
}

// The CV editor takes a role's bullets as one block of text, one bullet per line.
// Leading "-", "•", "*" or numbering is stripped; a line that's unchanged keeps its id.
export function bulletsFromText(text: string, previous: Bullet[], newId: () => string): Bullet[] {
  const pool = previous.filter((b) => b.status === "approved");
  return String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*·▪–]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const i = pool.findIndex((b) => b.text === line);
      const keep = i >= 0 ? pool.splice(i, 1)[0] : null;
      return keep ?? { id: newId(), text: line, status: "approved" as const, source: "user" as const };
    });
}

export const bulletsToText = (bullets: Bullet[]) => bullets.filter((b) => b.status === "approved").map((b) => b.text).join("\n");

// PR-02: only approved bullets are ever used.
export function approvedBullets(role: Role) {
  return role.bullets.filter((b) => b.status === "approved");
}

// PR-03: skills that may appear in an application: on the CV, or ticked in the skills bank.
export function usableSkills(profile: Pick<Profile, "skills">): string[] {
  return profile.skills.filter((s) => s.onCv || s.ticked).map((s) => s.name);
}

// TL-03: what the LLM is allowed to see. No name, contact details, links or self-ID answers.
export function llmSafeProfile(profile: Profile) {
  return {
    summary: profile.summary,
    roles: orderedRoles(profile.experience).map((r) => ({
      id: r.id,
      title: r.title,
      employer: r.employer,
      start: r.start,
      end: r.end,
      bullets: approvedBullets(r).map((b) => ({ id: b.id, text: b.text })),
    })),
    skills: usableSkills(profile),
    education: profile.education.map((e) => ({ qualification: e.qualification, year: e.year })),
    certifications: profile.certifications,
    writingSamples: profile.writingSamples.slice(0, 3),
  };
}

export const formatMonth = (s: string | null) => {
  if (!s) return "Present";
  const [y, m] = s.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1] ?? ""} ${y}`.trim();
};

// TL-06: a short fingerprint of everything that goes into a tailored CV. Each application keeps the
// fingerprint it was tailored from; if the master CV has changed since, it is tailored again before
// it is submitted. Contact details aren't included: those are always read fresh.
export function cvFingerprint(profile: Pick<Profile, "summary" | "experience" | "skills" | "education" | "certifications">): string {
  const parts = JSON.stringify([
    profile.summary ?? "",
    (profile.experience ?? []).map((r) => [r.id, r.title, r.employer, r.team ?? "", r.location ?? "", r.start, r.end, approvedBullets(r).map((b) => b.text)]),
    usableSkills(profile),
    profile.education ?? [],
    profile.certifications ?? [],
  ]);
  let h = 0x811c9dc5; // FNV-1a, 32-bit: no crypto needed, works in the browser too
  for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}
