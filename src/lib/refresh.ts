// TL-06: a match you haven't applied to yet always offers documents from your latest master CV.
// If the CV has changed since the match was tailored, it is tailored again (same rules, same
// validator) and saved when you open it. Text you've edited yourself is never replaced without asking.
import { cvFingerprint } from "./cv";
import type { Db } from "./db";
import type { LLM } from "./llm";
import { saveTailored, type ApplicationRow } from "./store";
import { asksForCoverLetter } from "./pipeline";
import { tailor, type Tailored } from "./tailor";
import type { Job, Profile } from "./types";
import { immigrationText, wantsCoverLetter, type JobPlace } from "./workauth";

// Only matches you haven't applied to yet are refreshed; once applied, the documents are what you sent.
export const REFRESHABLE = new Set(["new"]);

const changed = (app: Pick<ApplicationRow, "tailored">, profile: Profile) => app.tailored?.cvVersion !== cvFingerprint(profile);

export function isStale(app: Pick<ApplicationRow, "status" | "tailored">, profile: Profile) {
  return REFRESHABLE.has(app.status) && !app.tailored?.edited && changed(app, profile);
}

// DOC-04: you edited the text, and your master CV has changed since: offer to regenerate.
export function editedButOutdated(app: Pick<ApplicationRow, "status" | "tailored">, profile: Profile) {
  return REFRESHABLE.has(app.status) && !!app.tailored?.edited && changed(app, profile);
}

// `withCover`: also write a cover letter even where the rules wouldn't (DOC-06, you asked for one).
export async function tailorFor(app: ApplicationRow, profile: Profile, llm: LLM | null, withCover = !!app.tailored?.coverOnRequest): Promise<Tailored> {
  const job: Job = {
    source: "greenhouse", sourceId: String(app.job_id), company: app.company, title: app.title, location: app.location,
    remote: app.mode === "remote", url: app.url, description: app.description ?? "", employmentType: null,
    salary: app.salary ?? null, postedAt: null, ats: (app.ats as Job["ats"]) ?? null, attribution: app.attribution ?? null,
  };
  const place = { region: app.region, mode: app.mode, countries: app.countries } as JobPlace;
  const byRule = wantsCoverLetter(place, { required: asksForCoverLetter(job.description) });
  const t = await tailor(profile, job, llm, { coverLetter: byRule || withCover, immigrationText: immigrationText(place) });
  return !byRule && withCover && t.coverLetter ? { ...t, coverOnRequest: true } : t;
}

export async function freshTailored(db: Db, userId: string, app: ApplicationRow, profile: Profile, llm: LLM | null): Promise<Tailored> {
  if (!isStale(app, profile)) return app.tailored;
  const tailored = await tailorFor(app, profile, llm);
  await saveTailored(db, userId, app.id, tailored);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'cv_updated', $3)", [userId, app.id, JSON.stringify({ cvVersion: tailored.cvVersion })]);
  return tailored;
}
