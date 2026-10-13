// The midnight report and action emails.
import { describe, expect, test } from "vitest";
import { actionEmail, buildReport, type AppSummary } from "@/lib/report";

// 00:05 on 14 Oct in London (BST, UTC+1), so the report covers 13 Oct.
const NOW = new Date("2026-10-13T23:05:00Z");
const day = new Date("2026-10-13T10:00:00Z");
const earlier = new Date("2026-10-10T10:00:00Z");
const app = (over: Partial<AppSummary>): AppSummary => ({ id: 1, company: "Acme", title: "Business Analyst", region: "UK", score: 88, status: "applied", createdAt: day, appliedAt: day, ...over });

describe("TR reporting", () => {
  test("TR-02 the midnight report lists applied, pending, unresolved and new matches for the day just ended", () => {
    const r = buildReport([
      app({ id: 1 }),
      app({ id: 2, status: "needs_approval", appliedAt: null, createdAt: earlier }),
      app({ id: 3, status: "needs_action", appliedAt: null, note: "essay question" }),
      app({ id: 4, appliedAt: earlier, createdAt: earlier }),
    ], NOW, "https://app.example");
    expect(r.counts).toEqual({ applied: 1, pending: 1, unresolved: 1, fresh: 2 });
    expect(r.subject).toBe("1 applied, 2 waiting for you");
    expect(r.text).toContain("Tuesday 13 October");
    expect(r.text).toContain("https://app.example/applications/3");
    expect(r.text).toContain("essay question");
  });
  test("TR-03 an action email names the role, what's needed and where to fix it", () => {
    const e = actionEmail(app({ id: 7, status: "needs_action" }), ["Why do you want to work at Acme? (essay question)"], "https://app.example");
    expect(e.subject).toBe("Action needed: Business Analyst at Acme");
    expect(e.text).toContain("- Why do you want to work at Acme? (essay question)");
    expect(e.text).toContain("https://app.example/applications/7");
  });
});
