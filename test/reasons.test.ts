// Plain reasons for anything waiting on the user.
import { describe, expect, test } from "vitest";
import { waitingReason } from "@/lib/reasons";

const base = { status: "needs_approval" as const, score: 80, ats: "greenhouse", url: "https://job-boards.greenhouse.io/acme/jobs/1", flags: [], unresolved: [] };

describe("TR-05 why an application is waiting", () => {
  test("TR-05 a score under the auto-submit level says so, with both numbers", () => {
    const r = waitingReason(base, 85);
    expect(r.short).toBe("Scored 80; auto-submit starts at 85.");
    expect(r.details).toHaveLength(1);
  });
  test("TR-05 a form the worker can't submit alone names the site", () => {
    const r = waitingReason({ ...base, score: 90, ats: null, url: "https://www.himalayas.app/companies/acme/jobs/1" }, 85);
    expect(r.short).toBe("Strong match, but the form is on himalayas.app, which needs you to press submit.");
  });
  test("TR-05 both reasons together, and a flagged job explains the flag", () => {
    const r = waitingReason({ ...base, score: 70, ats: null, url: "https://careers.acme.com/1", flags: ["Possible prompt injection in the job text (ignore previous)"] }, 85);
    expect(r.short).toContain("Scored 70");
    expect(r.short).toContain("careers.acme.com");
    expect(r.details[0]).toMatch(/instructions aimed at the AI/);
    expect(r.details).toHaveLength(3);
  });
  test("TR-05 needs-input lists what the worker stopped at", () => {
    const r = waitingReason({ ...base, status: "needs_action", unresolved: [{ label: "Why Acme?", reason: "essay question" }, { label: "CAPTCHA", reason: "the form has a CAPTCHA" }] });
    expect(r.short).toBe('Stopped at 2 things, starting with "Why Acme?" (essay question).');
    expect(r.details).toEqual(["Why Acme?: essay question", "CAPTCHA: the form has a CAPTCHA"]);
  });
});
