// The match email: when it's due, and what it says.
import { describe, expect, test } from "vitest";
import { buildDigest, digestDue, londonHour, type DigestApp } from "@/lib/digest";

const H = 3600000;
// 14 Oct 2026 08:10 in London (BST, UTC+1).
const AT_8 = new Date("2026-10-14T07:10:00Z");
const app = (over: Partial<DigestApp> = {}): DigestApp => ({ id: 1, company: "Acme", title: "Business Analyst", region: "UK", score: 82, status: "new", createdAt: new Date(AT_8.getTime() - 2 * H), updatedAt: new Date(AT_8.getTime() - 2 * H), hasCoverLetter: false, ...over });

describe("NT-01 when the digest goes out", () => {
  test("NT-01 only in the hour you picked, in UK time (summer and winter)", () => {
    expect(londonHour(AT_8)).toBe(8);
    expect(londonHour(new Date("2026-12-14T08:10:00Z"))).toBe(8); // GMT in winter
    expect(digestDue({ every: 1, hour: 8 }, null, AT_8)).toBe(true);
    expect(digestDue({ every: 1, hour: 9 }, null, AT_8)).toBe(false);
  });
  test("NT-01 daily means once a day, even if the hourly run fires twice", () => {
    expect(digestDue({ every: 1, hour: 8 }, new Date(AT_8.getTime() - 24 * H), AT_8)).toBe(true);
    expect(digestDue({ every: 1, hour: 8 }, new Date(AT_8.getTime() - 20 * 60000), AT_8)).toBe(false);
    expect(digestDue({ every: 1, hour: 8 }, new Date(AT_8.getTime() - 23 * H), AT_8)).toBe(true); // a late run yesterday doesn't skip today
  });
  test("NT-01 every two days skips the day in between", () => {
    expect(digestDue({ every: 2, hour: 8 }, new Date(AT_8.getTime() - 24 * H), AT_8)).toBe(false);
    expect(digestDue({ every: 2, hour: 8 }, new Date(AT_8.getTime() - 48 * H), AT_8)).toBe(true);
  });
});

describe("NT-02 what the digest says", () => {
  test("NT-02 lists new matches with which documents are ready and a link to each", () => {
    const d = buildDigest([app(), app({ id: 2, company: "Usco", region: "US", hasCoverLetter: true })], new Date(AT_8.getTime() - 24 * H), AT_8, "https://app.test")!;
    expect(d.subject).toBe("2 new matches with documents ready");
    expect(d.text).toContain("- Business Analyst at Acme (UK, score 82): CV ready\n  https://app.test/applications/1");
    expect(d.text).toContain("Usco (US, score 82): CV and cover letter ready");
  });
  test("NT-02 older matches still waiting are listed separately, with a warning when they're about to expire", () => {
    const old = app({ id: 3, createdAt: new Date(AT_8.getTime() - 27 * 24 * H), updatedAt: new Date(AT_8.getTime() - 27 * 24 * H) });
    const d = buildDigest([old, app({ id: 4, status: "interview" })], new Date(AT_8.getTime() - 24 * H), AT_8, "https://app.test")!;
    expect(d.subject).toBe("1 match still ready for you");
    expect(d.text).toContain("No new matches since your last email.");
    expect(d.text).toContain("Still ready for you (1)");
    expect(d.text).toContain("1 of these expire within 5 days");
    expect(d.text).toContain("Interview: 1");
  });
  test("NT-02 nothing new and nothing waiting means no email at all", () => {
    expect(buildDigest([app({ status: "applied" })], new Date(AT_8.getTime() - 24 * H), AT_8, "https://app.test")).toBeNull();
  });
});
