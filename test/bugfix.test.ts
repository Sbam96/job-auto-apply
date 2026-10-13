// Regression tests for bugs found while building and using the app. Named "BUG n:".
import { describe, expect, test } from "vitest";
import { evaluate } from "@/lib/match";
import { matchLocation, parseLocation } from "@/lib/location";
import { job, NOW, profile } from "./helpers";

describe("bug regressions", () => {
  test('BUG 1: "Home based - EMEA" (Canonical\'s wording) was read as an office role', () => {
    expect(parseLocation("Home based - EMEA").mode).toBe("remote");
  });
  test('BUG 2: a location of just "Anywhere" was read as on-site and skipped', () => {
    expect(matchLocation(parseLocation("Anywhere"), [{ region: "UK", modes: ["remote"], cities: [] }])).toMatchObject({ ok: true });
  });
  test("BUG 3: domain words in the CV (e.g. insurance) counted as missing skills", () => {
    const ev = evaluate(job({ description: "Business Analyst for an insurance team: user stories, acceptance criteria, Jira, SQL, agile. 3 years of experience." }), profile(), NOW);
    expect(ev.pass).toBe(true);
    if (ev.pass) expect(ev.score.missingSkills).not.toContain("insurance");
  });
});
