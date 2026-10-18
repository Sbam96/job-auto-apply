// SO-01 to SO-03: sorting matches by match, pay and closeness.
import { describe, expect, test } from "vitest";
import { annualGbp, formatSalary, proximity, salaryOf, sortMatches } from "@/lib/sorting";
import { profile } from "./helpers";

const row = (id: number, over: Partial<{ score: number; salary: { min: number | null; max: number | null; currency: string | null } | null; description: string; region: string; mode: string; location: string; created_at: Date }> = {}) =>
  ({ id, score: 80, salary: null, description: "", region: "UK", mode: "remote", location: "Remote - UK", created_at: new Date(2026, 9, id), ...over });

describe("SO pay", () => {
  test("SO-02 pay comes from the listing, or else from the job description", () => {
    expect(salaryOf(row(1, { salary: { min: 50000, max: 60000, currency: "GBP" } }))).toEqual({ min: 50000, max: 60000, currency: "GBP" });
    expect(salaryOf(row(1, { description: "The salary range is $120,000 - $150,000 plus equity." }))).toEqual({ min: 120000, max: 150000, currency: "USD" });
    expect(salaryOf(row(1, { description: "Pay: £55k–£65k" }))).toEqual({ min: 55000, max: 65000, currency: "GBP" });
    expect(salaryOf(row(1, { description: "We have 3 offices and 120 staff." }))).toBeNull();
  });
  test("SO-02 different currencies and day rates go on one yearly scale", () => {
    expect(annualGbp({ min: 120000, max: 150000, currency: "USD" })).toBe(115500);
    expect(annualGbp({ min: 400, max: 500, currency: "GBP" })).toBe(115000); // a day rate
    expect(formatSalary({ min: 120000, max: 150000, currency: "USD" })).toBe("$120k–$150k");
  });
});

describe("SO sorting", () => {
  const p = profile({ homeCity: "Manchester, UK" });
  test("SO-01 best match first", () => {
    expect(sortMatches([row(1, { score: 76 }), row(2, { score: 91 }), row(3, { score: 84 })], "match", p).map((r) => r.id)).toEqual([2, 3, 1]);
  });
  test("SO-02 highest pay first, unlisted pay last", () => {
    const rows = [row(1), row(2, { salary: { min: 50000, max: 60000, currency: "GBP" } }), row(3, { salary: { min: 110000, max: 130000, currency: "USD" } })];
    expect(sortMatches(rows, "salary", p).map((r) => r.id)).toEqual([3, 2, 1]);
  });
  test("SO-03 closest first: your city, remote UK, rest of UK, EMEA, Canada, US", () => {
    const rows = [
      row(1, { region: "US", location: "Remote - United States" }),
      row(2, { region: "UK", mode: "hybrid", location: "Manchester, UK" }),
      row(3, { region: "EMEA", location: "Remote - Europe" }),
      row(4, { region: "UK", mode: "hybrid", location: "London, UK" }),
      row(5, { region: "UK", mode: "remote" }),
      row(6, { region: "CA", location: "Remote - Canada" }),
    ];
    expect(sortMatches(rows, "proximity", p).map((r) => r.id)).toEqual([2, 5, 4, 3, 6, 1]);
    expect(proximity(rows[1], p).label).toBe("In your city");
  });
});
