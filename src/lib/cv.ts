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
    thresholds: { apply: 75, auto: 85 },
    paused: false,
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
    thresholds: { ...base.thresholds, ...(p.thresholds ?? {}) },
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
