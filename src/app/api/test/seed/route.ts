// Test-only: creates a matched application for a user, so browser tests don't need the internet.
// Only exists when E2E_HOOKS=1. Never set that in production.
import { getDb } from "@/lib/db";
import { londonDay } from "@/lib/pipeline";
import { getProfile, PgPipelineStore, saveDirectLink, saveProfile, userByEmail } from "@/lib/store";
import { baselineTailor } from "@/lib/tailor";
import { cvFingerprint } from "@/lib/cv";
import type { Job } from "@/lib/types";

export async function POST(req: Request) {
  if (process.env.E2E_HOOKS !== "1") return new Response("Not found", { status: 404 });
  const { email, company = "Acme", region = "UK", status = "new", url = "https://job-boards.greenhouse.io/acme/jobs/1", description = "Write user stories and acceptance criteria in Jira. SQL. Agile. 3+ years of experience.", coverLetter = null, source = "greenhouse", direct, profile: profilePatch } = await req.json();
  const db = await getDb();
  const user = await userByEmail(db, email);
  if (!user) return Response.json({ error: "no user" }, { status: 404 });
  if (profilePatch) await saveProfile(db, user.id, { ...(await getProfile(db, user.id)), ...profilePatch });
  const now = new Date();
  const store = new PgPipelineStore(db, londonDay(now));
  const job: Job = {
    source, sourceId: `e2e:${company}:${region}:${Date.now()}`, company, title: "Business Analyst", location: `Remote - ${region}`, remote: true, url,
    description, employmentType: "permanent", salary: null, postedAt: null, ats: source === "greenhouse" ? "greenhouse" : null, attribution: null,
  };
  const ids = await store.saveJobs([job]);
  const profile = await getProfile(db, user.id);
  const id = await store.createApplication({
    userId: user.id, jobId: ids.get(`${source}:${job.sourceId}`)!, dedupeKey: `e2e|${job.sourceId}`, region, mode: "remote", countries: [],
    score: 82, breakdown: { title: 30, skills: 30, experience: 15, domain: 7, total: 82, matchedSkills: ["jira", "sql"], missingSkills: [] },
    flags: [], tailored: { ...baselineTailor(profile, job), coverLetter, cvVersion: cvFingerprint(profile) },
  });
  // SR-08: a job-board listing, with the employer's link found ({url, via}) or not (null).
  if (direct !== undefined) await saveDirectLink(db, ids.get(`${source}:${job.sourceId}`)!, direct);
  if (status !== "new") await db.query("UPDATE applications SET status = $2, applied_at = CASE WHEN $2 IN ('applied','response','interview','offer','rejected') THEN now() END WHERE id = $1", [id, status]);
  return Response.json({ id });
}
