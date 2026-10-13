// Hard filters, title matching, scoring and duplicates.
import { describe, expect, test } from "vitest";
import { dedupeKey, employmentTypeOf, evaluate, payFits, scoreJob, seniorityFits, seniorityOf, titleMatch, yearsOfExperience } from "@/lib/match";
import { job, NOW, profile } from "./helpers";

describe("MT-02 employment type", () => {
  test("MT-02 permanent and fixed-term pass; contract is filtered out by default", () => {
    const p = profile();
    expect(evaluate(job({ employmentType: "permanent" }), p, NOW).pass).toBe(true);
    expect(evaluate(job({ employmentType: "fixed-term" }), p, NOW).pass).toBe(true);
    const c = evaluate(job({ employmentType: "contract" }), p, NOW);
    expect(c).toMatchObject({ pass: false, stage: "type" });
  });
  test("MT-02 the type is worked out from the text when the source doesn't say", () => {
    expect(employmentTypeOf(job({ description: "This is a 12-month fixed-term contract covering maternity leave." }))).toBe("fixed-term");
    expect(employmentTypeOf(job({ title: "Business Analyst (Contract)", description: "Outside IR35, day rate" }))).toBe("contract");
    expect(employmentTypeOf(job())).toBe("permanent");
  });
});

describe("MT-03 seniority", () => {
  test("MT-03 levels are read from the title", () => {
    expect(seniorityOf("Senior Business Analyst")).toBe("senior");
    expect(seniorityOf("Junior Business Analyst")).toBe("junior");
    expect(seniorityOf("Lead Business Analyst")).toBe("lead");
    expect(seniorityOf("Business Analyst")).toBe("mid");
    expect(seniorityOf("Associate Product Manager")).toBe("junior");
  });
  test("MT-03 the baseline and one level above pass; below or two above are skipped", () => {
    expect(seniorityFits("mid", "mid")).toBe(true);
    expect(seniorityFits("senior", "mid")).toBe(true);
    expect(seniorityFits("junior", "mid")).toBe(false);
    expect(seniorityFits("lead", "mid")).toBe(false);
    expect(evaluate(job({ title: "Junior Business Analyst" }), profile(), NOW)).toMatchObject({ pass: false, stage: "seniority" });
  });
});

describe("MT-04 pay floor", () => {
  const floor = { usd: 90000, gbp: 50000 };
  test("MT-04 pay below the floor is filtered; at or above passes", () => {
    expect(payFits({ salary: { min: 60000, max: 80000, currency: "USD" } }, floor)).toBe(false);
    expect(payFits({ salary: { min: 85000, max: 95000, currency: "USD" } }, floor)).toBe(true);
    expect(payFits({ salary: { min: 40000, max: 45000, currency: "GBP" } }, floor)).toBe(false);
  });
  test("MT-04 jobs that don't list pay, or list another currency, pass", () => {
    expect(payFits({ salary: null }, floor)).toBe(true);
    expect(payFits({ salary: { min: 50000, max: 60000, currency: "EUR" } }, floor)).toBe(true);
  });
  test("MT-04 day rates are annualised before comparing", () => {
    expect(payFits({ salary: { min: 400, max: 450, currency: "GBP" } }, floor)).toBe(true); // ~£100k a year
  });
});

describe("MT-05 titles", () => {
  test("MT-05 the exact target title, ignoring level words", () => {
    expect(titleMatch("Senior Business Analyst", ["Business Analyst"])).toBe("exact");
  });
  test("MT-05 similar titles in the same family match", () => {
    expect(titleMatch("Business Systems Analyst", ["Business Analyst"])).toBe("similar");
    expect(titleMatch("Requirements Analyst", ["Business Analyst"])).toBe("similar");
    expect(titleMatch("Product Analyst", ["Business Analyst"])).toBe("similar");
  });
  test("MT-05 unrelated titles don't", () => {
    expect(titleMatch("Account Executive", ["Business Analyst"])).toBeNull();
    expect(evaluate(job({ title: "Software Engineer" }), profile(), NOW)).toMatchObject({ pass: false, stage: "title" });
  });
});

describe("MT-06 score", () => {
  test("MT-06 a strong fit scores 75 or more", () => {
    const s = scoreJob(job(), profile(), NOW, "exact");
    expect(s.total).toBeGreaterThanOrEqual(75);
    expect(s.total).toBeLessThanOrEqual(100);
    expect(s.matchedSkills).toEqual(expect.arrayContaining(["jira", "sql", "user stories"]));
  });
  test("MT-06 a weak fit scores under 75 and is skipped", () => {
    const weak = job({ description: "Business Analyst needed: Salesforce, Python, Tableau, Snowflake, dbt, Looker, SAP and Pega experience. 8+ years of experience." });
    const ev = evaluate(weak, profile(), NOW);
    expect(ev).toMatchObject({ pass: false, stage: "score" });
  });
  test("MT-06 ticked skills-bank items count; suggested-but-unticked ones don't", () => {
    const p = profile();
    const s = scoreJob(job({ description: "Miro and Tableau for workshop facilitation." }), p, NOW, "exact");
    expect(s.matchedSkills).toContain("miro");
    expect(s.missingSkills).toContain("tableau");
  });
  test("MT-06 years of experience merge overlapping roles and count to today", () => {
    expect(yearsOfExperience(profile(), NOW)).toBeCloseTo(7.8, 0);
  });
});

describe("MT-07 duplicates", () => {
  test("MT-07 the same role at the same company and region has one key", () => {
    const a = dedupeKey({ company: "Acme Inc", title: "Business Analyst" }, "US");
    const b = dedupeKey({ company: "acme inc.", title: "Business Analyst " }, "US");
    expect(a).toBe(b);
  });
  test("MT-07 each location variant is its own application", () => {
    expect(dedupeKey({ company: "Acme", title: "Business Analyst" }, "US")).not.toBe(dedupeKey({ company: "Acme", title: "Business Analyst" }, "UK"));
  });
  test("MT-07 different levels of the same title are different roles", () => {
    expect(dedupeKey({ company: "Acme", title: "Business Analyst" }, "US")).not.toBe(dedupeKey({ company: "Acme", title: "Senior Business Analyst" }, "US"));
  });
});
