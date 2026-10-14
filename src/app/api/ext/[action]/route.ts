// The browser extension's API (EX-01 to EX-05). Every call carries the connection key from Settings.
//   GET  /api/ext/me                       who's connected
//   POST /api/ext/match   {url,title,company,text}   which match is this page? plus your ready list
//   POST /api/ext/plan    {id, fields, captcha}      answers for the form's questions
//   GET  /api/ext/file?id=&doc=cv|cover    the tailored PDF to attach
//   POST /api/ext/applied {id}             mark the match applied
import { APPLIED_STATUSES } from "@/lib/config";
import { getDb } from "@/lib/db";
import { coverText } from "@/lib/documents";
import { buildDocument } from "@/lib/download";
import { planForm, type FormQuestion } from "@/lib/forms";
import { extensionUser, json } from "@/lib/http";
import { llmFromEnv } from "@/lib/llm";
import { findMatchForPage } from "@/lib/pagematch";
import { freshTailored } from "@/lib/refresh";
import { getApplication, getProfile, listApplications, setStatus } from "@/lib/store";
import type { JobPlace } from "@/lib/workauth";

export const maxDuration = 120;

const FIELD_TYPES = new Set(["text", "textarea", "select", "radio", "checkbox", "file", "email", "tel", "url"]);

async function body(req: Request) {
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function GET(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const user = await extensionUser(req);
  if (!user) return json({ error: "This connection key isn't recognised. Generate a new one in the app's Settings." }, 401);
  const { action } = await params;
  const db = await getDb();
  if (action === "me") {
    const p = await getProfile(db, user.id);
    return json({ email: user.email, name: p.fullName });
  }
  if (action === "file") {
    const q = new URL(req.url).searchParams;
    const file = await buildDocument(db, user.id, Number(q.get("id")), q.get("doc") === "cover" ? "cover" : "cv", "pdf");
    if (!file) return json({ error: "Not found" }, 404);
    return new Response(Buffer.from(file.bytes), { headers: { "Content-Type": file.type, "X-File-Name": file.name, "Cache-Control": "no-store" } });
  }
  return json({ error: "Unknown action" }, 404);
}

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const user = await extensionUser(req);
  if (!user) return json({ error: "This connection key isn't recognised. Generate a new one in the app's Settings." }, 401);
  const { action } = await params;
  const db = await getDb();
  const b = await body(req);

  if (action === "match") {
    const url = String(b.url ?? "");
    if (!/^https?:\/\//.test(url)) return json({ error: "Open a job page first." }, 400);
    const apps = await listApplications(db, user.id, ["new", ...APPLIED_STATUSES]);
    const found = findMatchForPage({ url, title: String(b.title ?? ""), company: String(b.company ?? ""), text: String(b.text ?? "") }, apps);
    const summary = (a: (typeof apps)[number]) => ({ id: a.id, title: a.title, company: a.company, status: a.status, score: a.score, region: a.region, hasCoverLetter: !!a.tailored?.coverLetter });
    return json({ match: found ? summary(found) : null, ready: apps.filter((a) => a.status === "new").slice(0, 30).map(summary) });
  }

  const id = Number(b.id);
  const app = Number.isInteger(id) ? await getApplication(db, user.id, id) : null;
  if (!app) return json({ error: "That match no longer exists." }, 404);

  if (action === "plan") {
    const fields: FormQuestion[] = (Array.isArray(b.fields) ? b.fields : []).slice(0, 200).map((f) => {
      const x = f as Partial<FormQuestion>;
      return {
        label: String(x.label ?? "").slice(0, 300),
        type: (FIELD_TYPES.has(String(x.type)) ? x.type : "text") as FormQuestion["type"],
        required: !!x.required,
        options: Array.isArray(x.options) ? x.options.slice(0, 100).map((o) => String(o).slice(0, 200)) : undefined,
        maxLength: typeof x.maxLength === "number" && x.maxLength > 0 ? x.maxLength : undefined,
      };
    }).filter((f) => f.label);
    const profile = await getProfile(db, user.id);
    const tailored = await freshTailored(db, user.id, app, profile, llmFromEnv());
    const place = { region: app.region, mode: app.mode, countries: app.countries } as JobPlace;
    const letter = tailored.coverLetter ? coverText(profile, tailored.coverLetter) : null;
    const plan = planForm(fields, profile, place, { coverLetter: letter, captcha: !!b.captcha });
    // A cover letter you asked for is text only: paste it rather than attach a file (DOC-06).
    if (tailored.coverOnRequest) {
      for (const a of plan.answers) if (a.kind === "file-cover") { a.kind = "text"; a.value = letter ?? ""; }
    }
    await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'filled', $3)", [user.id, id, JSON.stringify({ answered: plan.answers.length, left: plan.unresolved.length })]);
    return json({ ...plan, coverLetter: letter });
  }

  if (action === "applied") {
    if (app.status === "new") await setStatus(db, user.id, id, "applied", "Marked from the browser extension");
    return json({ ok: true, status: app.status === "new" ? "applied" : app.status });
  }

  return json({ error: "Unknown action" }, 404);
}
