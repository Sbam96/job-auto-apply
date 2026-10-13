// Test-only: creates a matched application for a user, so browser tests don't need the internet.
// Only exists when E2E_HOOKS=1. Never set that in production.
import { getDb } from "@/lib/db";
import { londonDay } from "@/lib/pipeline";
import { getProfile, PgPipelineStore, userByEmail } from "@/lib/store";
import { baselineTailor } from "@/lib/tailor";
import type { Job } from "@/lib/types";

export async function POST(req: Request) {
  if (process.env.E2E_HOOKS !== "1") return new Response("Not found", { status: 404 });
  const { email, company = "Acme", region = "UK", status = "needs_approval", url = "https://job-boards.greenhouse.io/acme/jobs/1" } = await req.json();
  const db = await getDb();
  const user = await userByEmail(db, email);
  if (!user) return Response.json({ error: "no user" }, { status: 404 });
  const now = new Date();
  const store = new PgPipelineStore(db, londonDay(now));
  const job: Job = {
    source: "greenhouse", sourceId: `e2e:${company}:${region}:${Date.now()}`, company, title: "Business Analyst", location: `Remote - ${region}`, remote: true, url,
    description: "Write user stories and acceptance criteria in Jira. SQL. Agile. 3+ years of experience.", employmentType: "permanent", salary: null, postedAt: null, ats: "greenhouse", attribution: null,
  };
  const ids = await store.saveJobs([job]);
  const profile = await getProfile(db, user.id);
  const id = await store.createApplication({
    userId: user.id, jobId: ids.get(`greenhouse:${job.sourceId}`)!, dedupeKey: `e2e|${job.sourceId}`, region, mode: "remote", countries: [],
    score: 82, breakdown: { title: 30, skills: 30, experience: 15, domain: 7, total: 82, matchedSkills: ["jira", "sql"], missingSkills: [] },
    route: "approval", status, flags: [], tailored: baselineTailor(profile, job),
  });
  return Response.json({ id });
}
