// Builds a master CV from an uploaded CV (PR-08).
// 1. Text is pulled out of the PDF, Word or text file here, on the server.
// 2. Contact details are read locally and removed, so the AI never sees them (TL-03).
// 3. The AI only sorts the text into roles, dates and bullets, copying bullets word for word.
// 4. Every bullet is checked against the original text: anything not found there comes back as a
//    suggestion to review, never as an approved line.
import type { LLM } from "./llm";
import { canonicalSkill, skillsIn } from "./skills";
import type { Bullet, Profile, Role, Skill } from "./types";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function extractText(bytes: Uint8Array, filename: string): Promise<string> {
  const name = filename.toLowerCase();
  if (name.endsWith(".pdf")) {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(bytes);
    const { text } = await pdfText(pdf, { mergePages: true });
    return String(text);
  }
  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return value;
  }
  if (name.endsWith(".txt") || name.endsWith(".md")) return new TextDecoder().decode(bytes);
  throw new Error("Upload a PDF, Word (.docx) or text file.");
}

export interface Contact { fullName: string; email: string; phone: string; linkedin: string; portfolio: string }

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)\d{3,4}[\s-]?\d{3,4}/g;
const URL = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|co\.uk|io|me|dev|net|org|uk|app)(?:\/[^\s)]*)?/gi;

// Reads contact details locally and returns the text without them.
export function splitContact(text: string): { contact: Contact; rest: string } {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim());
  const email = (text.match(EMAIL) ?? [])[0] ?? "";
  const phone = (text.match(PHONE) ?? []).map((p) => p.trim()).find((p) => p.replace(/\D/g, "").length >= 10) ?? "";
  // Take emails out first so "gmail.com" inside an address isn't read as a website.
  const urls = (String(text).replace(EMAIL, " ").match(URL) ?? []).filter((u) => !u.includes("@"));
  const linkedin = urls.find((u) => /linkedin\.com/i.test(u)) ?? "";
  const portfolio = urls.find((u) => !/linkedin\.com/i.test(u)) ?? "";
  // The name is usually the first short line with only letters.
  const first = lines.find((l) => l.length > 0) ?? "";
  const fullName = /^[A-Za-zÀ-ÿ'’ .-]{3,60}$/.test(first) && first.split(/\s+/).length <= 5 ? first : "";
  const rest = lines
    .filter((l, i) => !(fullName && i === lines.indexOf(first)))
    .join("\n")
    .replace(EMAIL, "[email]")
    .replace(URL, (m) => (m.includes("[email]") ? m : "[link]"))
    .replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[phone]" : m));
  return { contact: { fullName, email, phone, linkedin, portfolio }, rest };
}

export interface ParsedCv {
  summary: string;
  roles: { title: string; employer: string; team?: string; location?: string; start: string; end: string | null; bullets: string[] }[];
  education: { qualification: string; institution: string; year: string }[];
  certifications: string[];
  skills: string[];
}

const SYSTEM = `You turn the text of a CV into structured data. Rules:
- Copy every bullet point word for word from the CV. Do not reword, merge, summarise or invent anything.
- Dates as "YYYY-MM". Use null for "end" when the role is current. If only a year is given, use "-01" for the month.
- "team" is an optional project, programme or department named for the role.
- "skills" are skills, tools and methods the CV states, written as they appear.
- Reply with JSON only: {"summary": string, "roles": [{"title": string, "employer": string, "team": string, "location": string, "start": string, "end": string | null, "bullets": string[]}], "education": [{"qualification": string, "institution": string, "year": string}], "certifications": string[], "skills": string[]}`;

export async function parseCv(text: string, llm: LLM): Promise<ParsedCv> {
  const reply = await llm.json<ParsedCv>(SYSTEM, `CV text:\n<cv>\n${text.slice(0, 30000)}\n</cv>`);
  return {
    summary: String(reply.summary ?? ""),
    roles: Array.isArray(reply.roles) ? reply.roles : [],
    education: Array.isArray(reply.education) ? reply.education : [],
    certifications: Array.isArray(reply.certifications) ? reply.certifications.map(String) : [],
    skills: Array.isArray(reply.skills) ? reply.skills.map(String) : [],
  };
}

const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[•▪·*–—-]/g, " ").replace(/[^a-z0-9%£$€]+/g, " ").replace(/\s+/g, " ").trim();
const ym = (s: unknown) => (typeof s === "string" && /^\d{4}-\d{2}$/.test(s) ? s : typeof s === "string" && /^\d{4}$/.test(s) ? `${s}-01` : "");

// PR-08: only lines that really are in the uploaded CV become approved bullets.
export function toMasterCv(parsed: ParsedCv, sourceText: string, newId: () => string): Pick<Profile, "summary" | "experience" | "education" | "certifications" | "skills"> & { unverified: number } {
  const source = norm(sourceText);
  let unverified = 0;
  const experience: Role[] = parsed.roles
    .filter((r) => r && r.title && r.employer)
    .map((r) => ({
      id: newId(),
      title: String(r.title).slice(0, 120),
      employer: String(r.employer).slice(0, 120),
      team: r.team ? String(r.team).slice(0, 120) : "",
      location: r.location ? String(r.location).slice(0, 120) : "",
      start: ym(r.start),
      end: r.end ? ym(r.end) || null : null,
      bullets: (r.bullets ?? []).map(String).filter((b) => b.trim()).map((b): Bullet => {
        const found = norm(b).length > 0 && source.includes(norm(b));
        if (!found) unverified += 1;
        return { id: newId(), text: b.trim().slice(0, 500), status: found ? "approved" : "pending", source: found ? "user" : "app" };
      }),
    }));
  const skills: Skill[] = [];
  for (const name of [...new Set(parsed.skills.map((s) => s.trim()).filter(Boolean))]) {
    // A skill counts as on your CV only if the CV actually names it.
    if (skillsIn(sourceText, [name]).includes(canonicalSkill(name)) || source.includes(norm(name))) skills.push({ name, onCv: true, ticked: false, suggested: false });
  }
  return {
    summary: parsed.summary && source.includes(norm(parsed.summary).slice(0, 60)) ? parsed.summary.trim() : "",
    experience,
    education: parsed.education.filter((e) => e && (e.qualification || e.institution)).map((e) => ({ qualification: String(e.qualification ?? ""), institution: String(e.institution ?? ""), year: String(e.year ?? "") })),
    certifications: parsed.certifications.filter((c) => source.includes(norm(c))),
    skills,
    unverified,
  };
}
