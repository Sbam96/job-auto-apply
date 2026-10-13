// The laptop worker reports what happened: submitted, needs the user, or skipped.
import { getDb } from "@/lib/db";
import { json, workerUser } from "@/lib/http";
import { appUrl, sendMail } from "@/lib/mailer";
import { actionEmail } from "@/lib/report";
import { getApplication, logSubmission, markNeedsAction, setStatus, AppError } from "@/lib/store";

interface Body {
  id: number;
  outcome: "applied" | "needs_action" | "skipped";
  targetUrl?: string;
  payload?: Record<string, string>;
  unresolved?: { label: string; reason: string }[];
}

export async function POST(req: Request) {
  const user = await workerUser(req);
  if (!user) return json({ error: "Worker key not recognised." }, 401);
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body || !Number.isInteger(body.id)) return json({ error: "Bad request" }, 400);
  const db = await getDb();
  const app = await getApplication(db, user.id, body.id);
  if (!app) return json({ error: "Not found" }, 404);
  try {
    if (body.outcome === "applied") {
      await setStatus(db, user.id, app.id, "applied", "Submitted by the laptop worker");
      await logSubmission(db, user.id, app.id, body.targetUrl ?? app.url, body.payload ?? {}); // DP-03
    } else if (body.outcome === "needs_action") {
      const unresolved = (body.unresolved ?? []).slice(0, 30);
      await markNeedsAction(db, user.id, app.id, unresolved);
      // TR-03: tell the user straight away.
      const mail = actionEmail({ id: app.id, company: app.company, title: app.title, region: app.region, score: app.score, status: "needs_action", createdAt: app.created_at, appliedAt: null }, unresolved.map((u) => `${u.label} (${u.reason})`), appUrl());
      await sendMail(db, { to: user.email, subject: mail.subject, text: mail.text });
    } else if (body.outcome === "skipped") {
      await setStatus(db, user.id, app.id, "skipped", "Skipped at the laptop");
    }
  } catch (err) {
    if (err instanceof AppError) return json({ error: err.message }, 409);
    throw err;
  }
  return json({ ok: true });
}
