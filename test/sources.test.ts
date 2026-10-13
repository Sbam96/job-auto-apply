// Job sources: each one normalised into the same shape, within limits, failures isolated.
import { describe, expect, test } from "vitest";
import { boardUrl, fetchAll, normaliseAshby, normaliseGreenhouse, normaliseLever, normaliseRemotive, parseSalaryText, REMOTIVE_URL } from "@/lib/sources";
import { htmlToText } from "@/lib/sources/html";
import { ashby, fakeFetch, greenhouse, lever, remotive } from "./fixtures";

describe("SR sources", () => {
  test("SR-01 Remotive jobs are normalised, remote, and credited with a link back", () => {
    const [j] = normaliseRemotive(remotive);
    expect(j).toMatchObject({ source: "remotive", sourceId: "9001", company: "Delta", title: "Business Analyst", location: "Remote - USA", remote: true, employmentType: "contract" });
    expect(j.description).toBe("Requirements gathering & stakeholder management.");
    expect(j.salary).toEqual({ min: 90000, max: 120000, currency: "USD" });
    expect(j.attribution).toBe("Found on Remotive: https://remotive.com/remote-jobs/business/business-analyst-9001");
  });
  test("SR-01 Remotive is fetched no more than 4 times a day", async () => {
    const { impl, calls } = fakeFetch({ [REMOTIVE_URL]: remotive });
    const counts = new Map<string, number>();
    const deps = {
      fetchImpl: impl,
      canFetch: async (key: string) => (counts.get(key) ?? 0) < 4,
      recordFetch: async (key: string) => { counts.set(key, (counts.get(key) ?? 0) + 1); },
    };
    for (let i = 0; i < 6; i += 1) await fetchAll([], deps);
    expect(calls.filter((c) => c.startsWith(REMOTIVE_URL))).toHaveLength(4);
  });
  test("SR-02 Greenhouse jobs are normalised, HTML decoded to text", () => {
    const jobs = normaliseGreenhouse(greenhouse, { ats: "greenhouse", board: "acme", company: "Acme" });
    expect(jobs[0]).toMatchObject({ source: "greenhouse", sourceId: "acme:101", company: "Acme", location: "Home based - EMEA", ats: "greenhouse", url: "https://job-boards.greenhouse.io/acme/jobs/101" });
    expect(jobs[0].description).toBe("Write user stories in Jira & run SQL.\n\n- Agile");
  });
  test("SR-03 Lever jobs are normalised with all locations, commitment and salary", () => {
    const [j] = normaliseLever(lever, { ats: "lever", board: "beta", company: "Beta" });
    expect(j).toMatchObject({ source: "lever", sourceId: "beta:abc-123", location: "Remote - New York, NY / Remote - US", remote: true, employmentType: "permanent" });
    expect(j.salary).toEqual({ min: 110000, max: 140000, currency: "USD" });
    expect(j.description).toContain("Gather requirements");
  });
  test("SR-04 Ashby jobs are normalised; unlisted jobs are left out", () => {
    const jobs = normaliseAshby(ashby, { ats: "ashby", board: "gamma", company: "Gamma" });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ source: "ashby", location: "Remote - Remote (EMEA) / London", remote: true, employmentType: "permanent", salary: { min: 55000, max: 70000, currency: "GBP" } });
  });
  test("SR-05 one failing source doesn't stop the others", async () => {
    const boards = [
      { ats: "greenhouse", board: "broken", company: "Broken" },
      { ats: "greenhouse", board: "acme", company: "Acme" },
      { ats: "lever", board: "beta", company: "Beta" },
    ] as const;
    const { impl } = fakeFetch({
      [REMOTIVE_URL]: new Error("network down"),
      [boardUrl(boards[0])]: new Error("timeout"),
      [boardUrl(boards[1])]: greenhouse,
      [boardUrl(boards[2])]: lever,
    });
    const run = await fetchAll([...boards], { fetchImpl: impl, includeAggregators: false, canFetch: async () => true, recordFetch: async () => {} });
    expect(run.jobs).toHaveLength(3);
    expect(run.errors.map((e) => e.source)).toEqual(["remotive", "greenhouse:broken"]);
  });
  test("salary text in different formats", () => {
    expect(parseSalaryText("£50,000 - £60,000")).toEqual({ min: 50000, max: 60000, currency: "GBP" });
    expect(parseSalaryText("Competitive")).toBeNull();
  });
  test("HTML entities and tags become readable text", () => {
    expect(htmlToText("<p>R&amp;D &lt;b&gt;team&lt;/b&gt;</p><p>Second</p>")).toBe("R&D team\n\nSecond");
  });
});

describe("SR aggregators", () => {
  test("SR-06 Himalayas jobs are normalised: country limits become the location; pay is annualised; credited", async () => {
    const { normaliseHimalayas } = await import("@/lib/sources");
    const [j] = normaliseHimalayas({ jobs: [{ guid: "https://himalayas.app/companies/acme/jobs/ba-1", title: "Business Analyst", companyName: "Acme", locationRestrictions: ["United Kingdom", "Germany"], employmentType: "Full Time", minSalary: 40, maxSalary: 50, currency: "GBP", salaryPeriod: "hourly", description: "<p>Jira &amp; SQL</p>", applicationLink: "https://jobs.lever.co/acme/1", pubDate: 1760000000 }] });
    expect(j).toMatchObject({ source: "himalayas", company: "Acme", location: "Remote - United Kingdom, Germany", remote: true, employmentType: "permanent", ats: "lever", url: "https://jobs.lever.co/acme/1" });
    expect(j.salary).toEqual({ min: 80000, max: 100000, currency: "GBP" });
    expect(j.description).toBe("Jira & SQL");
    expect(j.attribution).toBe("Found on Himalayas: https://himalayas.app/companies/acme/jobs/ba-1");
    expect(normaliseHimalayas({ jobs: [{ title: "X", companyName: "Y", locationRestrictions: [] }] })[0].location).toBe("Remote - Worldwide");
  });
  test("SR-07 Remote OK jobs are normalised, its legal notice is skipped, and each job is credited", async () => {
    const { normaliseRemoteOk } = await import("@/lib/sources");
    const jobs = normaliseRemoteOk([{ legal: "API Terms of Service" }, { id: "77", position: "Business Analyst", company: "Beta", location: "USA", description: "<b>BA</b>", tags: ["sql", "jira"], url: "https://remoteok.com/remote-jobs/77", apply_url: "https://job-boards.greenhouse.io/beta/jobs/9", salary_min: 90000, salary_max: 120000 }]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ source: "remoteok", title: "Business Analyst", location: "Remote - USA", ats: "greenhouse", salary: { min: 90000, max: 120000, currency: "USD" } });
    expect(jobs[0].description).toContain("sql, jira");
    expect(jobs[0].attribution).toBe("Found on Remote OK: https://remoteok.com/remote-jobs/77");
  });
});
