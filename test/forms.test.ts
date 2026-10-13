// Filling application forms from stored answers, and routing.
import { describe, expect, test } from "vitest";
import { canAutoSubmit, planForm, type FormQuestion } from "@/lib/forms";
import { routeFor, atsFromUrl } from "@/lib/route";
import { IMMIGRATION_TEXT } from "@/lib/workauth";
import { profile } from "./helpers";

const US = { region: "US", mode: "remote" } as const;
const UK = { region: "UK", mode: "remote" } as const;
const q = (label: string, extra: Partial<FormQuestion> = {}): FormQuestion => ({ label, type: "text", required: true, ...extra });
const value = (plan: ReturnType<typeof planForm>, label: string) => plan.answers.find((a) => a.label === label)?.value;

const greenhouseForm: FormQuestion[] = [
  q("First Name"), q("Last Name"), q("Email", { type: "email" }), q("Phone", { type: "tel" }),
  q("Resume/CV", { type: "file" }), q("LinkedIn Profile", { required: false }),
  q("Are you legally authorized to work in the country where this job is located?", { type: "select", options: ["Yes", "No"] }),
  q("Will you now or in the future require visa sponsorship?", { type: "select", options: ["Yes", "No"] }),
  q("Gender", { type: "select", required: false, options: ["Male", "Female", "Decline To Self Identify"] }),
  q("Veteran Status", { type: "select", required: false, options: ["I am a protected veteran", "I am not a protected veteran", "I don't wish to answer"] }),
  q("Disability Status", { type: "select", required: false, options: ["Yes, I have a disability", "No, I do not have a disability", "I do not want to answer"] }),
];

describe("AP form filling", () => {
  test("AP-01 a standard Greenhouse form is answered in full and can auto-submit", () => {
    const plan = planForm(greenhouseForm, profile(), US);
    expect(plan.unresolved).toEqual([]);
    expect(canAutoSubmit(plan)).toBe(true);
    expect(value(plan, "First Name")).toBe("Alex");
    expect(value(plan, "Last Name")).toBe("Example");
    expect(value(plan, "Resume/CV")).toBe("cv");
  });
  test("PR-05 self-ID questions get the decline option, whatever it's called", () => {
    const plan = planForm(greenhouseForm, profile(), US);
    expect(value(plan, "Gender")).toBe("Decline To Self Identify");
    expect(value(plan, "Veteran Status")).toBe("I don't wish to answer");
    expect(value(plan, "Disability Status")).toBe("I do not want to answer");
  });
  test("WA-01 on a US form: not authorised, sponsorship per setting", () => {
    const plan = planForm(greenhouseForm, profile(), US);
    expect(value(plan, "Are you legally authorized to work in the country where this job is located?")).toBe("No");
    expect(value(plan, "Will you now or in the future require visa sponsorship?")).toBe("Yes");
  });
  test("WA-03 the same form for a UK role answers Yes and No", () => {
    const plan = planForm(greenhouseForm, profile(), UK);
    expect(value(plan, "Are you legally authorized to work in the country where this job is located?")).toBe("Yes");
    expect(value(plan, "Will you now or in the future require visa sponsorship?")).toBe("No");
  });
  test("PR-04 salary in USD for US roles and GBP for UK roles; notice period and US-hours overlap", () => {
    const qs = [q("Desired salary"), q("Notice period"), q("What time zone overlap can you offer with EST?")];
    expect(value(planForm(qs, profile(), US), "Desired salary")).toBe("110,000 USD");
    expect(value(planForm(qs, profile(), UK), "Desired salary")).toBe("£60,000");
    expect(value(planForm(qs, profile(), UK), "Notice period")).toBe("1 month");
    expect(value(planForm(qs, profile(), US), "What time zone overlap can you offer with EST?")).toMatch(/US Eastern/);
  });
  test("WA-05 the 'anything else' box carries the immigration text on US roles only", () => {
    const box = [q("Additional information", { type: "textarea", required: false })];
    expect(value(planForm(box, profile(), US), "Additional information")).toBe(IMMIGRATION_TEXT.long);
    expect(value(planForm(box, profile(), UK), "Additional information")).toBeUndefined();
    const small = [q("Additional information", { type: "textarea", required: false, maxLength: 200 })];
    expect(value(planForm(small, profile(), US), "Additional information")).toBe(IMMIGRATION_TEXT.short);
  });
  test("AP-03 an essay question stops auto-submit and is listed for the user", () => {
    const plan = planForm([...greenhouseForm, q("Why do you want to work at Acme?", { type: "textarea" })], profile(), US);
    expect(canAutoSubmit(plan)).toBe(false);
    expect(plan.unresolved).toEqual([{ label: "Why do you want to work at Acme?", reason: "essay question" }]);
  });
  test("AP-03 an unknown required question stops auto-submit", () => {
    const plan = planForm([...greenhouseForm, q("Do you hold a CBAP certification?", { type: "select", options: ["Yes", "No"] })], profile(), US);
    expect(plan.unresolved[0]).toMatchObject({ reason: "unknown question" });
  });
  test("AP-03 a CAPTCHA stops auto-submit", () => {
    expect(canAutoSubmit(planForm(greenhouseForm, profile(), US, { captcha: true }))).toBe(false);
  });
  test("AP-03 a missing stored answer for a required field stops auto-submit", () => {
    const plan = planForm([q("Phone", { type: "tel" })], profile({ phone: "" }), US);
    expect(plan.unresolved).toEqual([{ label: "Phone", reason: "no stored answer" }]);
  });
});

describe("AP routing", () => {
  test("AP-01 85 or more on a simple ATS goes to auto-submit", () => {
    expect(routeFor({ score: 85, ats: "greenhouse", flagged: false })).toBe("auto");
    expect(routeFor({ score: 92, ats: "ashby", flagged: false })).toBe("auto");
  });
  test("AP-02 75 to 84 goes to the approval queue", () => {
    expect(routeFor({ score: 84, ats: "greenhouse", flagged: false })).toBe("approval");
    expect(routeFor({ score: 75, ats: "lever", flagged: false })).toBe("approval");
  });
  test("AP-02 a high score on an unknown application site goes to approval", () => {
    expect(routeFor({ score: 95, ats: null, flagged: false })).toBe("approval");
  });
  test("TL-04 a flagged job always goes to approval", () => {
    expect(routeFor({ score: 99, ats: "greenhouse", flagged: true })).toBe("approval");
  });
  test("apply links are recognised by ATS", () => {
    expect(atsFromUrl("https://job-boards.greenhouse.io/acme/jobs/1")).toBe("greenhouse");
    expect(atsFromUrl("https://jobs.lever.co/acme/abc")).toBe("lever");
    expect(atsFromUrl("https://jobs.ashbyhq.com/acme/abc")).toBe("ashby");
    expect(atsFromUrl("https://acme.workday.com/job/1")).toBeNull();
  });
});
