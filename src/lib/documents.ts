// DOC-01 to DOC-02: the tailored CV and cover letter as PDF and Word files, built when you download
// them from the saved text (Render's free plan can't run a browser, and the text is all we need to keep).
// One simple, ATS-friendly layout: one column, standard headings, real text, no tables or images.
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { formatMonth } from "./cv";
import type { Tailored } from "./tailor";
import type { Profile } from "./types";

export type Block =
  | { kind: "name"; text: string }
  | { kind: "contact"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "role"; title: string; rest: string }
  | { kind: "meta"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "gap" };

const contactLine = (p: Profile) => [p.homeCity, p.contactEmail, p.phone, p.linkedin, p.portfolio].filter(Boolean).join("  |  ");

export function cvBlocks(p: Profile, t: Tailored): Block[] {
  const out: Block[] = [{ kind: "name", text: p.fullName || "Your name" }, { kind: "contact", text: contactLine(p) }];
  if (t.summary.trim()) out.push({ kind: "heading", text: "Summary" }, { kind: "para", text: t.summary.trim() });
  out.push({ kind: "heading", text: "Experience" });
  for (const r of t.roles) {
    out.push({ kind: "role", title: r.title, rest: `, ${r.employer}` });
    if (r.team) out.push({ kind: "meta", text: r.team });
    out.push({ kind: "meta", text: `${formatMonth(r.start)} to ${formatMonth(r.end)}` });
    for (const b of r.bullets) if (b.text.trim()) out.push({ kind: "bullet", text: b.text.trim() });
    out.push({ kind: "gap" });
  }
  if (t.skills.length) out.push({ kind: "heading", text: "Skills" }, { kind: "para", text: t.skills.join(", ") });
  if (p.education.length) {
    out.push({ kind: "heading", text: "Education" });
    for (const e of p.education) out.push({ kind: "para", text: `${e.qualification}, ${e.institution}${e.year ? ` (${e.year})` : ""}` });
  }
  if (p.certifications.length) out.push({ kind: "heading", text: "Certifications" }, { kind: "para", text: p.certifications.join(", ") });
  return out;
}

const SIGN_OFF = /^(kind regards|best regards|warm regards|regards|sincerely|yours sincerely|yours faithfully|best wishes|many thanks|thank you),?$/i;

export function coverBlocks(p: Profile, letter: string, job: { title: string; company: string }, today: Date): Block[] {
  const paras = String(letter ?? "").split(/\n\s*\n/).map((x) => x.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  const out: Block[] = [{ kind: "name", text: p.fullName || "Your name" }, { kind: "contact", text: contactLine(p) }, { kind: "gap" }];
  out.push({ kind: "para", text: today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }) });
  out.push({ kind: "para", text: `Re: ${job.title}, ${job.company}` }, { kind: "gap" });
  if (!/^dear\b/i.test(paras[0] ?? "")) out.push({ kind: "para", text: "Dear Hiring Manager," }, { kind: "gap" });
  // Don't repeat the name if the letter already ends with it; add a sign-off if it has none.
  const last = paras[paras.length - 1] ?? "";
  const endsWithName = p.fullName && last.toLowerCase().endsWith(p.fullName.toLowerCase());
  for (const para of paras) out.push({ kind: "para", text: para }, { kind: "gap" });
  if (!endsWithName) {
    if (!SIGN_OFF.test(last)) out.push({ kind: "para", text: "Kind regards," });
    out.push({ kind: "para", text: p.fullName || "" });
  }
  return out;
}

export const fileName = (p: Profile, doc: "cv" | "cover", company: string, ext: "pdf" | "docx") => {
  const slug = (s: string) => String(s ?? "").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return `${slug(p.fullName) || "CV"}-${doc === "cv" ? "CV" : "Cover-Letter"}-${slug(company) || "job"}.${ext}`;
};

// ---------- PDF ----------

const A4 = { w: 595.28, h: 841.89 };
const M = 48; // margins

export async function toPdf(blocks: Block[], title: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("Job Auto-Apply");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const width = A4.w - M * 2;

  // The built-in fonts only cover Western European characters; anything else becomes "?".
  const cache = new Map<string, boolean>();
  const safe = (font: PDFFont, text: string) => Array.from(String(text ?? "")).map((ch) => {
    if (ch === "\t") return " ";
    let ok = cache.get(ch);
    if (ok === undefined) { try { font.encodeText(ch); ok = true; } catch { ok = false; } cache.set(ch, ok); }
    return ok ? ch : "?";
  }).join("");
  const wrap = (font: PDFFont, size: number, text: string, max: number) => {
    const words = safe(font, text).split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= max || !line) line = next;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines;
  };
  const need = (h: number) => { if (y - h < M) { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M; } };
  const write = (text: string, opts: { font?: PDFFont; size?: number; x?: number; max?: number; lead?: number; color?: number } = {}) => {
    const font = opts.font ?? regular, size = opts.size ?? 10.5, lead = opts.lead ?? size * 1.38, x = opts.x ?? M;
    for (const l of wrap(font, size, text, opts.max ?? width - (x - M))) {
      need(lead);
      page.drawText(l, { x, y: y - size, size, font, color: opts.color != null ? grey(opts.color) : undefined });
      y -= lead;
    }
  };

  for (const b of blocks) {
    switch (b.kind) {
      case "name": write(b.text, { font: bold, size: 18, lead: 24 }); break;
      case "contact": write(b.text, { size: 9.5, color: 0.25 }); y -= 2; break;
      case "heading": {
        need(30); y -= 10;
        write(b.text.toUpperCase(), { font: bold, size: 10.5, lead: 14 });
        page.drawLine({ start: { x: M, y: y + 1 }, end: { x: A4.w - M, y: y + 1 }, thickness: 0.6, color: grey(0.6) });
        y -= 5; break;
      }
      case "para": write(b.text); break;
      case "role": {
        need(15);
        const t = safe(bold, b.title);
        const tw = bold.widthOfTextAtSize(t, 10.5);
        if (tw + regular.widthOfTextAtSize(safe(regular, b.rest), 10.5) <= width) {
          page.drawText(t, { x: M, y: y - 10.5, size: 10.5, font: bold });
          page.drawText(safe(regular, b.rest), { x: M + tw, y: y - 10.5, size: 10.5, font: regular });
          y -= 14.5;
        } else { write(b.title, { font: bold }); write(b.rest.replace(/^,\s*/, "")); }
        break;
      }
      case "meta": write(b.text, { size: 9.5, color: 0.3 }); break;
      case "bullet": {
        need(14);
        page.drawText("•", { x: M + 4, y: y - 10.5, size: 10.5, font: regular });
        write(b.text, { x: M + 16 });
        y -= 1.5; break;
      }
      case "gap": y -= 6; break;
    }
  }
  return pdf.save();
}

const grey = (v: number) => rgb(v, v, v);

// ---------- Word ----------

export async function toDocx(blocks: Block[], title: string): Promise<Uint8Array> {
  const font = "Arial";
  const paras: Paragraph[] = [];
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string } = {}) => new TextRun({ text, font, bold: o.bold, size: (o.size ?? 10.5) * 2, color: o.color });
  for (const b of blocks) {
    switch (b.kind) {
      case "name": paras.push(new Paragraph({ children: [run(b.text, { bold: true, size: 18 })], spacing: { after: 40 } })); break;
      case "contact": paras.push(new Paragraph({ children: [run(b.text, { size: 9.5, color: "404040" })], spacing: { after: 80 } })); break;
      case "heading": paras.push(new Paragraph({
        children: [run(b.text.toUpperCase(), { bold: true })],
        spacing: { before: 200, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
      })); break;
      case "para": paras.push(new Paragraph({ children: [run(b.text)], spacing: { after: 60 }, alignment: AlignmentType.LEFT })); break;
      case "role": paras.push(new Paragraph({ children: [run(b.title, { bold: true }), run(b.rest)], spacing: { before: 60 } })); break;
      case "meta": paras.push(new Paragraph({ children: [run(b.text, { size: 9.5, color: "4D4D4D" })] })); break;
      case "bullet": paras.push(new Paragraph({ children: [run(b.text)], bullet: { level: 0 }, spacing: { after: 30 } })); break;
      case "gap": paras.push(new Paragraph({ children: [], spacing: { after: 40 } })); break;
    }
  }
  const doc = new Document({
    title,
    creator: "Job Auto-Apply",
    styles: { default: { document: { run: { font, size: 21 } } } },
    sections: [{ properties: { page: { margin: { top: 960, bottom: 960, left: 960, right: 960 } } }, children: paras }],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}
