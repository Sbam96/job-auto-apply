"use server";
// Every form in the app posts to one of these. Each checks who is signed in before touching data.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PASSWORD_MIN, EMPLOYMENT_TYPES, REGIONS, SENIORITY, STATUSES, WORK_MODES, type Status } from "@/lib/config";
import { getDb } from "@/lib/db";
import { validEmail } from "@/lib/auth";
import { llmFromEnv } from "@/lib/llm";
import { appUrl, sendMail } from "@/lib/mailer";
import { REJECT_LABELS } from "@/lib/labels";
import { londonDay, runSearch, type RunResult } from "@/lib/pipeline";
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
    const maxYearsAsked = Math.min(30, Math.max(0, Math.round(Number(f.get("maxYearsAsked")) || 8)));
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
    const auto = Math.min(100, Math.max(apply, Number(f.get("autoThreshold")) || 85));
    return {
      ...p,
      targetTitles, seniority, seniorityMax, maxYearsAsked, employmentTypes, locations,
      salaryFloor: { usd: money(f, "floorUsd"), gbp: money(f, "floorGbp") },
      thresholds: { apply, auto },
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
  revalidatePath("/applications");
  revalidatePath(`/applications/${id}`);
  revalidatePath("/");
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

export async function workerTokenAction(): Promise<FormState> {
  const user = await requireUser();
  const token = await store.newWorkerToken(await getDb(), user.id);
  return { ok: true, message: token };
}

export async function deleteAccountAction(_: FormState, f: FormData): Promise<FormState> {
  const user = await requireUser();
  if (str(f, "confirm") !== "DELETE") return fail('Type DELETE in capitals to confirm.');
  await store.deleteAccount(await getDb(), user.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/signup?deleted=1");
}
