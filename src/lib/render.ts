// An ATS-friendly CV as HTML: one column, standard headings, real text. The worker prints it to PDF.
import { formatMonth } from "./cv";
import type { Tailored } from "./tailor";
import type { Profile } from "./types";

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function cvHtml(p: Profile, t: Tailored): string {
  const contact = [p.homeCity, p.contactEmail, p.phone, p.linkedin, p.portfolio].filter(Boolean).map(esc).join(" &nbsp;|&nbsp; ");
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${esc(p.fullName)} CV</title>
<style>
  @page { size: A4; margin: 16mm 16mm; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.4; color: #111; }
  h1 { font-size: 18pt; margin: 0 0 2pt; }
  h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #999; margin: 12pt 0 4pt; padding-bottom: 2pt; }
  .contact { font-size: 9.5pt; color: #333; }
  .role { margin: 6pt 0 0; } .role p { margin: 0; } .dates { color: #444; font-size: 9.5pt; }
  ul { margin: 3pt 0 0 14pt; padding: 0; } li { margin: 0 0 2pt; }
</style></head><body>
<h1>${esc(p.fullName)}</h1>
<p class="contact">${contact}</p>
${t.summary ? `<h2>Summary</h2><p>${esc(t.summary)}</p>` : ""}
<h2>Experience</h2>
${t.roles.map((r) => `<div class="role"><p><strong>${esc(r.title)}</strong>, ${esc(r.employer)}</p><p class="dates">${formatMonth(r.start)} to ${formatMonth(r.end)}</p><ul>${r.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul></div>`).join("\n")}
${t.skills.length ? `<h2>Skills</h2><p>${t.skills.map(esc).join(", ")}</p>` : ""}
${p.education.length ? `<h2>Education</h2>${p.education.map((e) => `<p>${esc(e.qualification)}, ${esc(e.institution)}${e.year ? ` (${esc(e.year)})` : ""}</p>`).join("")}` : ""}
${p.certifications.length ? `<h2>Certifications</h2><p>${p.certifications.map(esc).join(", ")}</p>` : ""}
</body></html>`;
}
