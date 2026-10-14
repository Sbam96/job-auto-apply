// The CV and cover letter files you download: they open, and say what the app shows you.
import { describe, expect, test } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { coverBlocks, cvBlocks, fileName, toDocx, toPdf } from "@/lib/documents";
import { baselineTailor } from "@/lib/tailor";
import { job, NOW, profile } from "./helpers";

const p = profile({ education: [{ qualification: "BSc Biomedical Science", institution: "University of Example", year: "2018" }] });
const t = baselineTailor(p, job());
const pdfText = async (bytes: Uint8Array) => String((await extractText(await getDocumentProxy(bytes), { mergePages: true })).text).replace(/\s+/g, " ");
const docxText = async (bytes: Uint8Array) => (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value.replace(/\s+/g, " ");

describe("DOC-01 the CV as PDF and Word", () => {
  test("DOC-01 the PDF opens and holds the name, contact line, every role and its bullets", async () => {
    const bytes = await toPdf(cvBlocks(p, t), "Alex Example CV");
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    const text = await pdfText(bytes);
    for (const s of ["Alex Example", "alex@example.com", "EXPERIENCE", "Business Analyst, Insureco", "Wrote user stories and acceptance criteria in Jira for 3 agile teams", "Consultant, Consultco", "EDUCATION", "BSc Biomedical Science, University of Example (2018)"]) expect(text).toContain(s);
    expect(text).not.toContain("Suggested: ran stakeholder workshops"); // pending lines never go out
  });
  test("DOC-02 the Word file opens and holds the same text", async () => {
    const bytes = await toDocx(cvBlocks(p, t), "Alex Example CV");
    expect(Buffer.from(bytes.slice(0, 2)).toString()).toBe("PK"); // a .docx is a zip
    const text = await docxText(bytes);
    for (const s of ["Alex Example", "EXPERIENCE", "Mapped claims processes in Visio and cut handling time by 20%", "Consultco"]) expect(text).toContain(s);
  });
  test("DOC-01 long CVs run onto a second page instead of falling off the bottom", async () => {
    const long = { ...t, roles: t.roles.map((r) => ({ ...r, bullets: Array.from({ length: 25 }, (_, i) => ({ sourceId: `x${i}`, text: `Line ${i} ${"delivered analysis ".repeat(6)}` })) })) };
    const pdf = await getDocumentProxy(await toPdf(cvBlocks(p, long), "long"));
    expect(pdf.numPages).toBeGreaterThan(1);
  });
  test("DOC-01 characters the PDF font can't show become ? rather than breaking the file", async () => {
    const odd = { ...t, summary: "Analyst — “quoted” £50k, café, 数据 ✓" };
    const text = await pdfText(await toPdf(cvBlocks(p, odd), "odd"));
    expect(text).toContain("Analyst — “quoted” £50k, café");
  });
  test("DOC-01 files are named after you, the document and the company", () => {
    expect(fileName(p, "cv", "Acme Inc.", "pdf")).toBe("Alex-Example-CV-Acme-Inc.pdf");
    expect(fileName(p, "cover", "Rubicon Path", "docx")).toBe("Alex-Example-Cover-Letter-Rubicon-Path.docx");
  });
});

describe("DOC-03 the cover letter file", () => {
  test("DOC-03 adds the date, the role, a greeting and a sign-off with your name", async () => {
    const blocks = coverBlocks(p, "I'm applying for the Business Analyst role.\n\nI have mapped claims processes.", { title: "Business Analyst", company: "Acme" }, NOW);
    const text = await pdfText(await toPdf(blocks, "cover"));
    for (const s of ["13 October 2026", "Re: Business Analyst, Acme", "Dear Hiring Manager,", "I have mapped claims processes.", "Kind regards,", "Alex Example"]) expect(text).toContain(s);
  });
  test("DOC-03 doesn't double up a greeting or sign-off the letter already has", () => {
    const blocks = coverBlocks(p, "Dear Acme team,\n\nBody.\n\nBest regards,", { title: "BA", company: "Acme" }, NOW);
    const paras = blocks.filter((b) => b.kind === "para").map((b) => (b as { text: string }).text);
    expect(paras.filter((x) => /^dear/i.test(x))).toHaveLength(1);
    expect(paras).not.toContain("Kind regards,");
    expect(paras[paras.length - 1]).toBe("Alex Example");
  });
});
