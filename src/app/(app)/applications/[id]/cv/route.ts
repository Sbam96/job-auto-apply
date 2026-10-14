// The tailored CV for one application as a printable page, so you can save it as a PDF and apply
// yourself in your normal browser (for sites that block automated browsers).
import { getDb } from "@/lib/db";
import { llmFromEnv } from "@/lib/llm";
import { freshTailored } from "@/lib/refresh";
import { cvHtml } from "@/lib/render";
import { currentUser } from "@/lib/session";
import { getApplication, getProfile } from "@/lib/store";

export const maxDuration = 120;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.verifiedAt) return new Response("Log in first.", { status: 401 });
  const id = Number((await params).id);
  const db = await getDb();
  const app = Number.isInteger(id) ? await getApplication(db, user.id, id) : null;
  if (!app) return new Response("Not found", { status: 404 });
  const profile = await getProfile(db, user.id);
  const tailored = await freshTailored(db, user.id, app, profile, llmFromEnv()); // TL-06
  const bar = `<div class="noprint" style="font-family:Arial;background:#eef1ff;border:1px solid #c9d1ff;padding:10px 14px;margin:0 0 16px;border-radius:8px">
    Tailored for <strong>${esc(app.title)}</strong> at <strong>${esc(app.company)}</strong>.
    <button onclick="window.print()" style="margin-left:8px">Save as PDF / print</button>
    <span style="color:#555">Choose “Save as PDF” as the printer.</span></div>
    <style>@media print{.noprint{display:none}}</style>`;
  const html = cvHtml(profile, tailored).replace(/<body([^>]*)>/, `<body$1>${bar}`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
