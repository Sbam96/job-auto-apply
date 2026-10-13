// Building a master CV from an uploaded CV (PR-08), and the privacy rule for it (TL-03).
import { describe, expect, test } from "vitest";
import { extractText, parseCv, splitContact, toMasterCv } from "@/lib/cvimport";
import { FakeLLM } from "@/lib/llm";

const CV = `Stephen Example
Manchester, UK | ste.example@gmail.com | +44 7700 900123 | linkedin.com/in/ste-example

Profile
Business Analyst with experience delivering modernisation and regulatory change in financial services.

Experience
Business Analyst Consultant, Hippo Digital (Jul 2026 – Present)
- Facilitated capability workshops to evaluate current state operations and identify challenges.
- Mapped as-is and to-be processes for a national data strategy.

Business Analyst, Aviva — Health Modernisation (Oct 2024 – Jun 2026)
- Elicited and managed requirements for broker onboarding and offboarding.
- Wrote user stories and acceptance criteria in Jira.

Skills
Jira, Confluence, Visio, SQL, Stakeholder management

Education
BSc Biomedical Science, University of Example, 2018
Certifications
AWS Certified Solutions Architect`;

let n = 0;
const ids = () => `x${++n}`;

describe("PR-08 reading an uploaded CV", () => {
  test("TL-03 name, email, phone and links are read locally and removed before the AI sees the text", () => {
    const { contact, rest } = splitContact(CV);
    expect(contact).toEqual({ fullName: "Stephen Example", email: "ste.example@gmail.com", phone: "+44 7700 900123", linkedin: "linkedin.com/in/ste-example", portfolio: "" });
    for (const secret of ["Stephen Example", "ste.example@gmail.com", "7700 900123", "linkedin.com/in/ste-example"]) expect(rest).not.toContain(secret);
    expect(rest).toContain("Facilitated capability workshops");
  });
  test("PR-08 the AI only sorts the CV; bullets found word for word become approved lines", async () => {
    const { rest } = splitContact(CV);
    const llm = new FakeLLM(() => ({
      summary: "Business Analyst with experience delivering modernisation and regulatory change in financial services.",
      roles: [
        { title: "Business Analyst Consultant", employer: "Hippo Digital", team: "", start: "2026-07", end: null, bullets: ["Facilitated capability workshops to evaluate current state operations and identify challenges.", "Mapped as-is and to-be processes for a national data strategy."] },
        { title: "Business Analyst", employer: "Aviva", team: "Health Modernisation", start: "2024-10", end: "2026-06", bullets: ["Elicited and managed requirements for broker onboarding and offboarding.", "Led a team of 40 analysts across Europe."] },
      ],
      education: [{ qualification: "BSc Biomedical Science", institution: "University of Example", year: "2018" }],
      certifications: ["AWS Certified Solutions Architect", "PMP"],
      skills: ["Jira", "Confluence", "SQL", "Stakeholder management", "Kubernetes"],
    }));
    const cv = toMasterCv(await parseCv(rest, llm), rest, ids);
    expect(llm.calls[0].prompt).not.toContain("ste.example@gmail.com");
    expect(cv.experience).toHaveLength(2);
    expect(cv.experience[1]).toMatchObject({ employer: "Aviva", team: "Health Modernisation", start: "2024-10", end: "2026-06" });
    const aviva = cv.experience[1].bullets;
    expect(aviva[0]).toMatchObject({ status: "approved", source: "user" });
    // Not in the CV: comes back as a suggestion to review, never approved.
    expect(aviva[1]).toMatchObject({ text: "Led a team of 40 analysts across Europe.", status: "pending", source: "app" });
    expect(cv.unverified).toBe(1);
    expect(cv.skills.map((s) => s.name)).toEqual(["Jira", "Confluence", "SQL", "Stakeholder management"]); // Kubernetes isn't on the CV
    expect(cv.certifications).toEqual(["AWS Certified Solutions Architect"]); // PMP isn't either
    expect(cv.summary).toContain("regulatory change");
  });
  test("PR-08 text files are read; unsupported files get a clear message", async () => {
    expect(await extractText(new TextEncoder().encode("Hello CV"), "cv.txt")).toBe("Hello CV");
    await expect(extractText(new Uint8Array([1, 2, 3]), "cv.pages")).rejects.toThrow(/PDF, Word/);
  });
});
