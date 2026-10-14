// Runs every hour from GitHub Actions: tidies up (RT-01 to RT-03), then sends any digests due (NT-01).
import { withDefaults } from "@/lib/cv";
import { getDb } from "@/lib/db";
import { buildDigest, digestDue } from "@/lib/digest";
import { cronAuthorised, json } from "@/lib/http";
import { appUrl, sendMail } from "@/lib/mailer";
import { housekeeping, lastDigest, listApplications, recordDigest } from "@/lib/store";
import type { Profile } from "@/lib/types";

export async function POST(req: Request) {
  if (!cronAuthorised(req)) return json({ error: "unauthorised" }, 401);
  const now = new Date();
  const force = new URL(req.url).searchParams.get("force") === "1";
  const db = await getDb();
  const tidy = await housekeeping(db, now);
  const { rows: users } = await db.query<{ id: string; email: string; data: Partial<Profile> | null }>(
    "SELECT u.id, u.email, p.data FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.verified_at IS NOT NULL");
  let sent = 0;
  for (const u of users) {
    const profile = withDefaults(u.data);
    const last = await lastDigest(db, u.id);
    if (!force && !digestDue(profile.digest, last, now)) continue;
    const apps = await listApplications(db, u.id);
    const digest = buildDigest(apps.map((a) => ({ id: a.id, company: a.company, title: a.title, region: a.region, score: a.score, status: a.status, createdAt: a.created_at, updatedAt: a.updated_at, hasCoverLetter: !!a.tailored?.coverLetter })), last, now, appUrl());
    await recordDigest(db, u.id, now);
    if (!digest) continue;
    await sendMail(db, { to: u.email, subject: digest.subject, text: digest.text });
    sent += 1;
  }
  return json({ sent, ...tidy });
}
