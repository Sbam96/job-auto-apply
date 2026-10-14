// TL-06: an application waiting to be submitted always goes out with the latest master CV.
// If the CV has changed since the application was tailored, it is tailored again (same rules,
// same validator) and saved before the worker or the review page uses it.
import { cvFingerprint } from "./cv";
import type { Db } from "./db";
import type { LLM } from "./llm";
import { saveTailored, type ApplicationRow } from "./store";
import { tailor, type Tailored } from "./tailor";
import type { Job, Profile } from "./types";
import { immigrationText, wantsCoverLetter, type JobPlace } from "./workauth";

// Only applications that haven't gone out yet are refreshed.
export const REFRESHABLE = new Set(["needs_approval", "needs_action", "queued"]);

export function isStale(app: Pick<ApplicationRow, "status" | "tailored">, profile: Profile) {
  return REFRESHABLE.has(app.status) && app.tailored?.cvVersion !== cvFingerprint(profile);
}

export async function freshTailored(db: Db, userId: string, app: ApplicationRow, profile: Profile, llm: LLM | null): Promise<Tailored> {
  if (!isStale(app, profile)) return app.tailored;
  const job: Job = {
    source: "greenhouse", sourceId: String(app.job_id), company: app.company, title: app.title, location: app.location,
    remote: app.mode === "remote", url: app.url, description: app.description ?? "", employmentType: null,
    salary: app.salary ?? null, postedAt: null, ats: (app.ats as Job["ats"]) ?? null, attribution: app.attribution ?? null,
  };
  const place = { region: app.region, mode: app.mode, countries: app.countries } as JobPlace;
  const tailored = await tailor(profile, job, llm, { coverLetter: wantsCoverLetter(place), immigrationText: immigrationText(place) });
  await saveTailored(db, userId, app.id, tailored);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'cv_updated', $3)", [userId, app.id, JSON.stringify({ cvVersion: tailored.cvVersion })]);
  return tailored;
}
