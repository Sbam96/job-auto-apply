// TR-02: the midnight report. GitHub Actions calls this at 23:00 and 00:00 UTC; it only sends in
// the hour after midnight UK time, and only once per day, so it's right in summer and winter.
import { getDb } from "@/lib/db";
import { cronAuthorised, json } from "@/lib/http";
import { appUrl, sendMail } from "@/lib/mailer";
import { londonDay } from "@/lib/pipeline";
import { buildReport } from "@/lib/report";
import { listApplications } from "@/lib/store";

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return json({ error: "unauthorised" }, 401);
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const hour = Number(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }));
  if (hour !== 0 && !force) return json({ skipped: `UK hour is ${hour}, not midnight` });
  const db = await getDb();
  const day = londonDay(new Date(now.getTime() - 60 * 60 * 1000));
  const { rows: users } = await db.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE verified_at IS NOT NULL");
  let sent = 0;
  for (const u of users) {
    const claimed = await db.query("INSERT INTO report_runs (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING 1", [u.id, day]);
    if (!claimed.rows.length) continue; // already sent today
    const apps = await listApplications(db, u.id);
    const report = buildReport(apps.map((a) => ({ id: a.id, company: a.company, title: a.title, region: a.region, score: a.score, status: a.status, createdAt: a.created_at, appliedAt: a.applied_at, note: a.note })), now, appUrl());
    await sendMail(db, { to: u.email, subject: report.subject, text: report.text });
    sent += 1;
  }
  return json({ sent, day });
}
