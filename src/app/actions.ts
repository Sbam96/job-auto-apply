"use server";
// Every form in the app posts to one of these. Each checks who is signed in before touching data.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { DEFAULT_SEARCH_EVERY, SEARCH_CADENCES, PASSWORD_MIN, EMPLOYMENT_TYPES, REGIONS, SENIORITY, STATUSES, WORK_MODES, type Status } from "@/lib/config";
import { getDb } from "@/lib/db";
import { validEmail } from "@/lib/auth";
import { llmFromEnv } from "@/lib/llm";
import { appUrl, sendMail } from "@/lib/mailer";
import { REJECT_LABELS } from "@/lib/labels";
import { companyKey, londonDay, runSearch, type RunResult } from "@/lib/pipeline";
import { tailorFor } from "@/lib/refresh";
import { rememberAnswers } from "@/lib/answers";
import { requireUser, SESSION_COOKIE, setSessionCookie, currentUser } from "@/lib/session";
import * as store from "@/lib/store";
import type { Profile, Role, Skill, UserLocation } from "@/lib/types";

export type FormState = { ok: boolean; message: string } | null;

const str = (f: FormData, k: string, max = 2000) => String(f.get(k) ?? "").trim().slice(0, max);
const money = (f: FormData, k: string) => {
  const n = Number(String(f.get(k) ?? "").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};
const lines = (s: string) => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
const fail = (message: string): FormState => ({ ok: false, message });

// ---------- accounts ----------

export async function signupAction(_: FormState, f: FormData): Promise<FormState> {
  const email = str(f, "email", 200);
  const password = String(f.get("password") ?? "");
  if (!validEmail(email)) return fail("Enter a valid email address.");
  if (password.length < PASSWORD_MIN) return fail(`Use a password of at least ${PASSWORD_MIN} characters.`);
  const db = await getDb();
  try {
    const { user, verifyToken } = await store.createUser(db, email, password);
    await sendVerification(user.email, verifyToken);
    await setSessionCookie(await store.createSession(db, user.id));
  } catch (err) {
    if (err instanceof store.AppError) return fail(err.message);
    throw err;
  }
  redirect("/check-email");
}

async function sendVerification(email: string, token: string) {
  const db = await getDb();
  await sendMail(db, {
    to: email,
    subject: "Verify your email for Job Auto-Apply",
    text: `Confirm your email to start using Job Auto-Apply:\n\n${appUrl()}/verify?token=${token}\n\nThis link works once and expires in 48 hours. If you didn't sign up, ignore this email.`,
  });
}

export async function resendVerificationAction(): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.verifiedAt) redirect("/");
  const db = await getDb();
  await sendVerification(user.email, await store.newEmailToken(db, user.id, "verify"));
  return { ok: true, message: "Sent. Check your inbox (and spam)." };
}

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const db = await getDb();
  const user = await store.login(db, str(f, "email", 200), String(f.get("password") ?? ""));
  if (!user) return fail("That email and password don't match.");
  await setSessionCookie(await store.createSession(db, user.id));
  redirect(user.verifiedAt ? "/" : "/check-email");
}

export async function logoutAction() {
  const jar = await cookies();
  await store.endSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- profile ----------

async function updateProfile(fn: (p: Profile) => Profile | string, path: string): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const next = fn(await store.getProfile(db, user.id));
  if (typeof next === "string") return fail(next);
  await store.saveProfile(db, user.id, next);
  revalidatePath(path);
  return { ok: true, message: "Saved." };
}

export async function saveDetailsAction(_: FormState, f: FormData): Promise<FormState> {
  return updateProfile((p) => {
    const contactEmail = str(f, "contactEmail", 200);
    if (contactEmail && !validEmail(contactEmail)) return "The contact email doesn't look right.";
    const selfId = (k: string) => str(f, `selfId.${k}`, 100) || "prefer_not";
    return {
      ...p,
      fullName: str(f, "fullName", 120),
      contactEmail,
      phone: str(f, "phone", 40),
      homeCity: str(f, "homeCity", 120),
      linkedin: str(f, "linkedin", 300),
      portfolio: str(f, "portfolio", 300),
      noticePeriod: str(f, "noticePeriod", 120),
      usHoursOverlap: str(f, "usHoursOverlap", 300),
      expectedSalary: { usd: money(f, "expectedUsd"), gbp: money(f, "expectedGbp") },
      selfId: { veteran: selfId("veteran"), disability: selfId("disability"), race: selfId("race"), gender: selfId("gender") },
      writingSamples: String(f.get("writingSamples") ?? "").split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean).slice(0, 3).map((s) => s.slice(0, 4000)),
    };
  }, "/profile");
}

export async function savePreferencesAction(_: FormState, f: FormData): Promise<FormState> {
  return updateProfile((p) => {
    const targetTitles = lines(str(f, "targetTitles", 2000)).slice(0, 10);
    if (!targetTitles.length) return "Add at least one target job title.";
    const seniority = str(f, "seniority") as Profile["seniority"];
    const seniorityMax = str(f, "seniorityMax") as Profile["seniority"];
    if (!SENIORITY.includes(seniority) || !SENIORITY.includes(seniorityMax)) return "Pick the levels to apply for.";
    if (SENIORITY.indexOf(seniorityMax) < SENIORITY.indexOf(seniority)) return "The highest level can't be below the lowest.";
    const maxYearsAsked = Math.min(30, Math.max(0, Math.round(Number(f.get("maxYearsAsked")) || 5)));
    const employmentTypes = f.getAll("employmentTypes").map(String).filter((t): t is Profile["employmentTypes"][number] => (EMPLOYMENT_TYPES as readonly string[]).includes(t));
    if (!employmentTypes.length) return "Tick at least one employment type.";
    let locations: UserLocation[];
    try {
      locations = (JSON.parse(String(f.get("locations") ?? "[]")) as UserLocation[])
        .filter((l) => (REGIONS as readonly string[]).includes(l.region))
        .map((l) => ({ region: l.region, modes: l.modes.filter((m) => (WORK_MODES as readonly string[]).includes(m)), cities: (l.cities ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 10) }))
        .filter((l) => l.modes.length)
        .slice(0, 4); // PR-06
    } catch { return "Locations couldn't be read; try again."; }
    if (!locations.length) return "Add at least one location with a work mode ticked.";
    const apply = Math.min(100, Math.max(50, Number(f.get("applyThreshold")) || 75));
    const every = Number(f.get("searchEvery"));
    const searchEvery = SEARCH_CADENCES.some((c) => c.hours === every) ? every : DEFAULT_SEARCH_EVERY;
    return {
      ...p,
      targetTitles, seniority, seniorityMax, maxYearsAsked, employmentTypes, locations,
      salaryFloor: { usd: money(f, "floorUsd"), gbp: money(f, "floorGbp") },
      thresholds: { apply },
      searchEvery,
      auth: { usSponsorship: str(f, "usSponsorship") !== "no", canadaSponsorship: true },
      paused: f.get("paused") === "on",
    };
  }, "/preferences");
}

export async function saveCvAction(_: FormState, f: FormData): Promise<FormState> {
  return updateProfile((p) => {
    try {
      const data = JSON.parse(String(f.get("cv") ?? "{}")) as { summary: string; experience: Role[]; education: Profile["education"]; certifications: string[]; skills: Skill[] };
      const experience = (data.experience ?? []).slice(0, 30).map((r) => ({
        id: String(r.id), title: String(r.title).slice(0, 120), employer: String(r.employer).slice(0, 120), team: String(r.team ?? "").trim().slice(0, 120), location: String(r.location ?? "").slice(0, 120),
        start: /^\d{4}-\d{2}$/.test(r.start) ? r.start : "", end: r.end && /^\d{4}-\d{2}$/.test(r.end) ? r.end : null,
        bullets: (r.bullets ?? []).slice(0, 40).map((b) => ({ id: String(b.id), text: String(b.text).trim().slice(0, 500), status: b.status, source: b.source })).filter((b) => b.text && (b.status === "approved" || b.status === "pending")),
      }));
      if (experience.some((r) => !r.title || !r.employer || !r.start)) return "Every role needs a title, employer and start month.";
      const skills = new Map<string, Skill>();
      for (const s of data.skills ?? []) {
        const name = String(s.name).trim().slice(0, 60);
        if (name && !skills.has(name.toLowerCase())) skills.set(name.toLowerCase(), { name, onCv: !!s.onCv, ticked: !!s.ticked, suggested: !!s.suggested });
      }
      return {
        ...p,
        summary: String(data.summary ?? "").slice(0, 1500),
        experience,
        education: (data.education ?? []).slice(0, 10).map((e) => ({ institution: String(e.institution).slice(0, 150), qualification: String(e.qualification).slice(0, 150), year: String(e.year).slice(0, 10) })),
        certifications: (data.certifications ?? []).map((c) => String(c).trim().slice(0, 150)).filter(Boolean).slice(0, 20),
        skills: [...skills.values()].slice(0, 200),
      };
    } catch {
      return "The CV couldn't be read; try again.";
    }
  }, "/cv");
}

// PR-02: the AI suggests extra bullets for a role. They come back as suggestions only;
// the CV editor adds them as "pending" and nothing uses them until the user approves.
export async function suggestBulletsAction(role: { title: string; employer: string; bullets: string[] }): Promise<{ ok: boolean; message: string; bullets: string[] }> {
  await requireUser();
  const llm = llmFromEnv();
  if (!llm) return { ok: false, message: "Add GEMINI_API_KEY in Render to get suggestions.", bullets: [] };
  try {
    const reply = await llm.json<{ bullets?: string[] }>(
      "You help a business analyst write CV bullets. Suggest typical, honest bullets for the role that the person can confirm or reject. Never invent numbers or employers. Reply as JSON: {\"bullets\": string[]}.",
      `Role: ${role.title.slice(0, 100)} at ${role.employer.slice(0, 100)}.\nExisting bullets:\n${role.bullets.slice(0, 20).map((b) => `- ${b.slice(0, 300)}`).join("\n")}\n\nSuggest up to 4 additional bullets describing everyday work in this role, without numbers.`,
    );
    const bullets = (reply.bullets ?? []).map((b) => String(b).trim().slice(0, 300)).filter(Boolean).slice(0, 4);
    return { ok: true, message: bullets.length ? `${bullets.length} suggestions added for you to approve or reject.` : "No suggestions this time.", bullets };
  } catch (err) {
    return { ok: false, message: `Suggestions failed: ${(err as Error).message}`, bullets: [] };
  }
}

// ---------- companies ----------

export async function addBoardAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const ats = str(f, "ats") as "greenhouse" | "lever" | "ashby";
  if (!["greenhouse", "lever", "ashby"].includes(ats)) return fail("Pick the system the company uses.");
  // Accept a full careers link as well as a board name.
  const raw = str(f, "board", 300);
  const board = raw.match(/(?:greenhouse\.io|lever\.co|ashbyhq\.com)\/(?:v\d\/boards\/|posting-api\/job-board\/|v0\/postings\/)?([A-Za-z0-9_.-]+)/)?.[1] ?? raw;
  if (!/^[A-Za-z0-9_.-]{2,80}$/.test(board)) return fail("Enter the board name, e.g. gitlab, or paste the careers link.");
  await store.addBoard(await getDb(), user.id, { ats, board, company: str(f, "company", 120) || board });
  revalidatePath("/companies");
  return { ok: true, message: `Added ${board}.` };
}

export async function removeBoardAction(f: FormData) {
  const user = await requireUser();
  await store.removeBoard(await getDb(), user.id, Number(f.get("id")));
  revalidatePath("/companies");
}

// ---------- applications ----------

export async function setStatusAction(f: FormData) {
  const user = await requireUser();
  const to = String(f.get("status")) as Status;
  if (!STATUSES.includes(to)) return;
  const id = Number(f.get("id"));
  await store.setStatus(await getDb(), user.id, id, to, str(f, "note", 500) || null);
  revalidatePath("/", "layout");
}

// Searches now, for this user only.
export async function searchNowAction(): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const now = new Date();
  const mine = new store.PgPipelineStore(db, londonDay(now), user.id);
  const profile = await store.getProfile(db, user.id);
  if (!profile.experience.length) return fail("Add your work history on the CV page first; the search needs it to score jobs.");
  if (profile.paused) return fail("Searching is paused in Preferences.");
  let result: RunResult;
  try {
    result = await runSearch({ store: mine, llm: llmFromEnv(), now });
  } catch (err) {
    return fail(`The search failed: ${(err as Error).message}`);
  }
  revalidatePath("/");
  revalidatePath("/applications");
  const made = result.created.length;
  const why = Object.entries(result.rejected).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${v} ${REJECT_LABELS[k] ?? k}`).join(", ");
  const skipped = result.skippedSources.length ? ` ${result.skippedSources.length} source(s) skipped: daily limit reached.` : "";
  const errors = result.sourceErrors.length ? ` ${result.sourceErrors.length} source(s) failed.` : "";
  return { ok: true, message: `Checked ${result.fetched} jobs. ${made ? `${made} new match${made === 1 ? "" : "es"}.` : "No new matches."}${why ? ` Of the rest, ${why}.` : ""}${skipped}${errors}` };
}

// ---------- settings ----------

// EX-01: the browser extension's connection key. A new key replaces the old one.
export async function extensionKeyAction(): Promise<FormState> {
  const user = await requireUser();
  const token = await store.newExtensionKey(await getDb(), user.id);
  revalidatePath("/settings");
  return { ok: true, message: token };
}

export async function revokeExtensionAction() {
  const user = await requireUser();
  await store.revokeExtensionKey(await getDb(), user.id);
  revalidatePath("/settings");
}

// NT-01: how often the digest email comes, and at what time (UK).
export async function saveNotificationsAction(_: FormState, f: FormData): Promise<FormState> {
  const every = Number(f.get("every")) === 2 ? 2 : 1;
  const hour = Math.round(Number(f.get("hour")));
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return fail("Pick a time for the email.");
  return updateProfile((p) => ({ ...p, digest: { every, hour } }), "/settings");
}

// ---------- matches: documents (DOC-03, DOC-04) ----------

// Your own edits to the tailored CV and cover letter. Titles, employers and dates stay as they are.
export async function saveDocumentsAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const id = Number(f.get("id"));
  const app = await store.getApplication(db, user.id, id);
  if (!app) return fail("That match no longer exists.");
  const t = app.tailored;
  const roles = t.roles.map((r) => {
    const raw = f.get(`role:${r.id}`);
    if (raw == null) return r;
    return { ...r, bullets: lines(String(raw).slice(0, 8000)).map((text, i) => ({ sourceId: r.bullets[i]?.sourceId ?? `edit-${r.id}-${i}`, text: text.replace(/^[-•*]\s*/, "") })) };
  });
  const skills = str(f, "skills", 2000).split(",").map((x) => x.trim()).filter(Boolean);
  const cover = f.get("coverLetter");
  await store.saveTailored(db, user.id, id, {
    ...t,
    summary: str(f, "summary", 3000),
    roles,
    skills,
    coverLetter: cover == null ? t.coverLetter : String(cover).trim().slice(0, 8000) || null,
    edited: true,
  });
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'edited', NULL)", [user.id, id]);
  revalidatePath(`/applications/${id}`);
  return { ok: true, message: "Saved. Your downloads now use this text." };
}

// Throws away edits and tailors again from the latest master CV.
export async function regenerateAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const id = Number(f.get("id"));
  const app = await store.getApplication(db, user.id, id);
  if (!app) return fail("That match no longer exists.");
  const llm = llmFromEnv();
  const tailored = await tailorFor(app, await store.getProfile(db, user.id), llm);
  await store.saveTailored(db, user.id, id, tailored);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'regenerated', NULL)", [user.id, id]);
  revalidatePath(`/applications/${id}`);
  return { ok: true, message: llm ? "Regenerated from your latest master CV." : "Regenerated using your own wording (the AI key isn't set)." };
}

// DOC-06: a cover letter on request, for matches that didn't get one. Text to copy into the form.
export async function writeCoverLetterAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  const db = await getDb();
  const id = Number(f.get("id"));
  const app = await store.getApplication(db, user.id, id);
  if (!app) return fail("That match no longer exists.");
  const llm = llmFromEnv();
  if (!llm) return fail("Writing a cover letter needs the AI key (GEMINI_API_KEY) set in Render.");
  const fresh = await tailorFor(app, await store.getProfile(db, user.id), llm, true);
  if (!fresh.coverLetter) return fail(`The AI couldn't write one just now${fresh.warnings[0] ? ` (${fresh.warnings[0]})` : ""}. Try again in a minute.`);
  // Only the letter is added; the CV (and any edits to it) stay as they are.
  await store.saveTailored(db, user.id, id, { ...app.tailored, coverLetter: fresh.coverLetter, coverOnRequest: !app.tailored.coverLetter || !!app.tailored.coverOnRequest });
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'cover_written', NULL)", [user.id, id]);
  revalidatePath(`/applications/${id}`);
  return { ok: true, message: "Cover letter written. Copy it into the form's cover letter box." };
}

// ---------- remembered answers (EX-08) ----------

export async function updateSavedAnswerAction(f: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const p = await store.getProfile(db, user.id);
  await store.saveProfile(db, user.id, { ...p, savedAnswers: rememberAnswers(p.savedAnswers, [{ question: str(f, "question", 300), answer: str(f, "answer", 2000) }]) });
  revalidatePath("/profile");
}

export async function deleteSavedAnswerAction(f: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const p = await store.getProfile(db, user.id);
  const q = str(f, "question", 300);
  await store.saveProfile(db, user.id, { ...p, savedAnswers: p.savedAnswers.filter((a) => a.question !== q) });
  revalidatePath("/profile");
}

// ---------- blocked companies (BL-01) ----------

export async function blockCompanyAction(f: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const company = str(f, "company", 200);
  if (!company) return;
  const p = await store.getProfile(db, user.id);
  if (!p.blockedCompanies.some((c) => companyKey(c) === companyKey(company))) await store.saveProfile(db, user.id, { ...p, blockedCompanies: [...p.blockedCompanies, company].slice(0, 200) });
  // Any open matches with them go to "Not for me".
  for (const a of await store.listApplications(db, user.id, ["new"])) {
    if (companyKey(a.company) === companyKey(company)) await store.setStatus(db, user.id, a.id, "dismissed", "Company blocked");
  }
  revalidatePath("/", "layout");
}

export async function unblockCompanyAction(f: FormData) {
  const user = await requireUser();
  const db = await getDb();
  const company = str(f, "company", 200);
  const p = await store.getProfile(db, user.id);
  await store.saveProfile(db, user.id, { ...p, blockedCompanies: p.blockedCompanies.filter((c) => companyKey(c) !== companyKey(company)) });
  revalidatePath("/companies");
}

export async function deleteAccountAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  if (str(f, "confirm") !== "DELETE") return fail('Type DELETE in capitals to confirm.');
  await store.deleteAccount(await getDb(), user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/signup?deleted=1");
}
