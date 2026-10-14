// EX-07: drafting essay answers from your CV only. EX-08: remembering your own answers.
import { describe, expect, test } from "vitest";
import { draftAnswer, rememberAnswers, savedAnswerFor } from "@/lib/answers";
import { planForm } from "@/lib/forms";
import { FakeLLM } from "@/lib/llm";
import { profile } from "./helpers";

const job = { title: "Business Analyst", company: "Acme", description: "Business Analyst for our claims team. Jira, SQL, stakeholder management." };

describe("EX-07 drafting an essay answer", () => {
  test("EX-07 the AI gets the question, the job and your CV, but never your name or contact details", async () => {
    const llm = new FakeLLM(() => ({ answer: "I've mapped claims processes in Visio and written user stories in Jira." }));
    const out = await draftAnswer(profile(), job, "Why do you want to work at Acme?", llm);
    expect(out).toEqual({ answer: "I've mapped claims processes in Visio and written user stories in Jira.", warnings: [] });
    const sent = llm.calls[0].prompt;
    expect(sent).toContain("Why do you want to work at Acme?");
    expect(sent).toContain("Mapped claims processes");
    for (const secret of ["Alex Example", "alex@example.com", "+44 7700 900000"]) expect(sent).not.toContain(secret);
  });
  test("EX-07 anything not on your CV is flagged for you to check", async () => {
    const llm = new FakeLLM(() => ({ answer: "I led 40 analysts and used Tableau daily." }));
    const out = await draftAnswer(profile(), job, "Tell us about your leadership.", llm);
    expect(out.warnings).toEqual(expect.arrayContaining(["adds number 40", 'adds skill "tableau"']));
  });
  test("EX-07 a character limit on the box is respected", async () => {
    const llm = new FakeLLM(() => ({ answer: "word ".repeat(100) }));
    expect((await draftAnswer(profile(), job, "Why us?", llm, 50)).answer.length).toBeLessThanOrEqual(50);
  });
});

describe("EX-08 remembered answers", () => {
  test("EX-08 the same question matches however it's punctuated; newer answers replace older ones", () => {
    let saved = rememberAnswers([], [{ question: "How many years have you used Jira? *", answer: "1-3" }]);
    saved = rememberAnswers(saved, [{ question: "how many years have you used jira", answer: "3+" }]);
    expect(saved).toEqual([{ question: "how many years have you used jira", answer: "3+" }]);
    expect(savedAnswerFor(saved, "How many years have you used Jira?")).toBe("3+");
    expect(savedAnswerFor(saved, "Do you have a driving licence?")).toBeNull();
  });
  test("EX-08 the form uses a remembered answer, even over the app's own guess", () => {
    const p = profile({ savedAnswers: [{ question: "How did you hear about us?", answer: "LinkedIn" }, { question: "Do you hold a CBAP?", answer: "No" }] });
    const plan = planForm([
      { label: "How did you hear about us?", type: "select", required: true, options: ["Job board", "LinkedIn", "Referral"] },
      { label: "Do you hold a CBAP?", type: "radio", required: true, options: ["Yes", "No"] },
    ], p, { region: "UK", mode: "remote" });
    expect(plan.answers.map((a) => a.value)).toEqual(["LinkedIn", "No"]);
    expect(plan.unresolved).toEqual([]);
  });
});
