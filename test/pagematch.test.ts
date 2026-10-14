// EX-02: recognising which match the page you're on belongs to.
import { describe, expect, test } from "vitest";
import { findMatchForPage, normUrl } from "@/lib/pagematch";

const m = (id: number, over: Partial<{ title: string; company: string; url: string; direct_url: string | null }> = {}) =>
  ({ id, title: "Business Analyst", company: "Acme", url: `https://job-boards.greenhouse.io/acme/jobs/${id}`, direct_url: null, ...over });

describe("EX-02 which match is this page?", () => {
  test("EX-02 the same job page matches through tracking links and the apply step", () => {
    expect(normUrl("https://jobs.lever.co/acme/abc/apply?lever-source=LinkedIn")).toBe(normUrl("https://jobs.lever.co/acme/abc"));
    expect(normUrl("https://www.acme.com/careers/job?jobId=7&utm_source=x#apply")).toBe("acme.com/careers/job?jobid=7");
  });
  test("EX-02 jobs told apart only by a query parameter stay different", () => {
    expect(normUrl("https://acme.com/careers?gh_jid=1")).not.toBe(normUrl("https://acme.com/careers?gh_jid=2"));
  });
  test("EX-02 by link first, including the employer's link found for a job-board listing", () => {
    const apps = [m(1), m(2, { url: "https://himalayas.app/companies/acme/jobs/ba", direct_url: "https://jobs.ashbyhq.com/acme/9" })];
    expect(findMatchForPage({ url: "https://jobs.ashbyhq.com/acme/9/application" }, apps)?.id).toBe(2);
  });
  test("EX-02 otherwise by title, but only when the company is on the page", () => {
    const apps = [m(1, { url: "https://x.example/1" })];
    expect(findMatchForPage({ url: "https://careers.acme.com/apply/55", title: "Senior Business Analyst", text: "Join Acme" }, apps)?.id).toBe(1);
    expect(findMatchForPage({ url: "https://careers.other.com/apply/55", title: "Business Analyst", text: "Join Other Ltd" }, apps)).toBeNull();
  });
});
