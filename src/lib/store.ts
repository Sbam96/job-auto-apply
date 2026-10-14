// Every database read and write. Each query that touches user data filters by user id (AU-04).
import { VERIFY_TOKEN_HOURS, SESSION_DAYS, type Status } from "./config";
import { withDefaults } from "./cv";
import type { Db } from "./db";
import { checkPassword, hashPassword, hashToken, newToken, normaliseEmail } from "./auth";
import type { NewApplication, PipelineStore, UserRunSummary } from "./pipeline";
import { STARTER_BOARDS } from "./seeds";
import type { Board } from "./sources";
import { canMove } from "./status";
import type { Tailored } from "./tailor";
import type { Job, Profile } from "./types";

export class AppError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export interface User { id: string; email: string; verifiedAt: Date | null }

// ---------- accounts (AU-01 to AU-03) ----------

export async function createUser(db: Db, email: string, password: string): Promise<{ user: User; verifyToken: string }> {
  const e = normaliseEmail(email);
  const hash = await hashPassword(password);
  const { rows } = await db.query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING RETURNING id", [e, hash]);
  if (!rows.length) throw new AppError("EMAIL_TAKEN", "An account with that email already exists. Try logging in.");
  const id = rows[0].id;
  await db.query("INSERT INTO profiles (user_id, data) VALUES ($1, $2)", [id, JSON.stringify({ ...withDefaults(null), contactEmail: e })]);
  for (const b of STARTER_BOARDS) {
    await db.query("INSERT INTO boards (user_id, ats, board, company) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING", [id, b.ats, b.board, b.company]);
  }
  const verifyToken = await newEmailToken(db, id, "verify");
  return { user: { id, email: e, verifiedAt: null }, verifyToken };
}

// AU-05: sign in with Google. Finds the account by Google ID, then by email (linking it, since
// Google has verified the address); otherwise creates a new, already-verified account.
export async function googleUser(db: Db, g: { sub: string; email: string; name: string }): Promise<{ user: User; created: boolean }> {
  const bySub = await db.query<{ id: string; email: string; verified_at: Date | null }>("SELECT id, email, verified_at FROM users WHERE google_sub = $1", [g.sub]);
  if (bySub.rows[0]) return { user: { id: bySub.rows[0].id, email: bySub.rows[0].email, verifiedAt: bySub.rows[0].verified_at }, created: false };
  const byEmail = await db.query<{ id: string; email: string }>(
    "UPDATE users SET google_sub = $2, verified_at = COALESCE(verified_at, now()) WHERE email = $1 RETURNING id, email", [normaliseEmail(g.email), g.sub]);
  if (byEmail.rows[0]) return { user: { id: byEmail.rows[0].id, email: byEmail.rows[0].email, verifiedAt: new Date() }, created: false };
  // A random password nobody knows: this account signs in with Google (or a reset later).
  const { user } = await createUser(db, g.email, newToken());
  await db.query("UPDATE users SET google_sub = $2, verified_at = now() WHERE id = $1", [user.id, g.sub]);
  await db.query("DELETE FROM email_tokens WHERE user_id = $1", [user.id]);
  if (g.name) {
    const p = await getProfile(db, user.id);
    if (!p.fullName) await saveProfile(db, user.id, { ...p, fullName: g.name });
  }
  return { user: { ...user, verifiedAt: new Date() }, created: true };
}

export async function newEmailToken(db: Db, userId: string, purpose: string): Promise<string> {
  const token = newToken();
  await db.query("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))",
    [hashToken(token), userId, purpose, VERIFY_TOKEN_HOURS]);
  return token;
}

export async function verifyEmail(db: Db, token: string): Promise<string | null> {
  const { rows } = await db.query<{ user_id: string }>(
    "DELETE FROM email_tokens WHERE token_hash = $1 AND purpose = 'verify' AND expires_at > now() RETURNING user_id", [hashToken(token)]);
  if (!rows.length) return null;
  await db.query("UPDATE users SET verified_at = COALESCE(verified_at, now()) WHERE id = $1", [rows[0].user_id]);
  return rows[0].user_id;
}

export async function login(db: Db, email: string, password: string): Promise<User | null> {
  const { rows } = await db.query<{ id: string; email: string; password_hash: string; verified_at: Date | null }>(
    "SELECT id, email, password_hash, verified_at FROM users WHERE email = $1", [normaliseEmail(email)]);
  const u = rows[0];
  if (!u || !(await checkPassword(password, u.password_hash))) return null;
  return { id: u.id, email: u.email, verifiedAt: u.verified_at };
}

export async function createSession(db: Db, userId: string): Promise<string> {
  const token = newToken();
  await db.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))", [hashToken(token), userId, SESSION_DAYS]);
  return token;
}

export async function userForSession(db: Db, token: string | undefined): Promise<User | null> {
  if (!token) return null;
  const { rows } = await db.query<{ id: string; email: string; verified_at: Date | null }>(
    "SELECT u.id, u.email, u.verified_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()", [hashToken(token)]);
  return rows[0] ? { id: rows[0].id, email: rows[0].email, verifiedAt: rows[0].verified_at } : null;
}

export async function endSession(db: Db, token: string | undefined) {
  if (token) await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
}

export async function userByEmail(db: Db, email: string) {
  const { rows } = await db.query<{ id: string; verified_at: Date | null }>("SELECT id, verified_at FROM users WHERE email = $1", [normaliseEmail(email)]);
  return rows[0] ?? null;
}

// The laptop worker signs in with its own token, shown once in Settings.
export async function newWorkerToken(db: Db, userId: string): Promise<string> {
  const token = `jaa_${newToken()}`;
  await db.query("UPDATE users SET worker_token_hash = $2 WHERE id = $1", [userId, hashToken(token)]);
  return token;
}

export async function userForWorker(db: Db, token: string | null): Promise<User | null> {
  if (!token) return null;
  // Records when the worker last checked in, so the dashboard can show whether it's running.
  const { rows } = await db.query<{ id: string; email: string; verified_at: Date | null }>(
    "UPDATE users SET worker_seen_at = now() WHERE worker_token_hash = $1 AND verified_at IS NOT NULL RETURNING id, email, verified_at", [hashToken(token)]);
  return rows[0] ? { id: rows[0].id, email: rows[0].email, verifiedAt: rows[0].verified_at } : null;
}

export async function workerSeenAt(db: Db, userId: string): Promise<Date | null> {
  const { rows } = await db.query<{ worker_seen_at: Date | null }>("SELECT worker_seen_at FROM users WHERE id = $1", [userId]);
  return rows[0]?.worker_seen_at ?? null;
}

// ---------- profile ----------

export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const { rows } = await db.query<{ data: Partial<Profile> }>("SELECT data FROM profiles WHERE user_id = $1", [userId]);
  return withDefaults(rows[0]?.data);
}

export async function saveProfile(db: Db, userId: string, profile: Profile) {
  await db.query(
    "INSERT INTO profiles (user_id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
    [userId, JSON.stringify(profile)]);
}

// ---------- company boards ----------

export async function listBoards(db: Db, userId: string) {
  const { rows } = await db.query<{ id: number; ats: Board["ats"]; board: string; company: string; active: boolean; last_error: string | null }>(
    "SELECT id, ats, board, company, active, last_error FROM boards WHERE user_id = $1 ORDER BY company", [userId]);
  return rows;
}

export async function addBoard(db: Db, userId: string, b: Board) {
  await db.query("INSERT INTO boards (user_id, ats, board, company) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, ats, board) DO UPDATE SET active = true, company = EXCLUDED.company",
    [userId, b.ats, b.board.trim(), b.company.trim()]);
}

export async function removeBoard(db: Db, userId: string, id: number) {
  await db.query("DELETE FROM boards WHERE user_id = $1 AND id = $2", [userId, id]);
}

// ---------- applications ----------

export interface ApplicationRow {
  id: number; status: Status; route: string; score: number; region: string; mode: string; countries: string[];
  breakdown: { title: number; skills: number; experience: number; domain: number; total: number; matchedSkills: string[]; missingSkills: string[] };
  flags: string[]; tailored: Tailored; unresolved: { label: string; reason: string }[]; note: string | null;
  created_at: Date; updated_at: Date; applied_at: Date | null;
  job_id: number; company: string; title: string; location: string; url: string; description: string; ats: string | null; attribution: string | null; salary: Job["salary"];
}

const APP_SELECT = `SELECT a.id, a.status, a.route, a.score, a.region, a.mode, a.countries, a.breakdown, a.flags, a.tailored, a.unresolved, a.note,
  a.created_at, a.updated_at, a.applied_at, j.id AS job_id, j.company, j.title, j.location, j.url, j.description, j.ats, j.attribution, j.salary
  FROM applications a JOIN jobs j ON j.id = a.job_id`;

export async function listApplications(db: Db, userId: string, statuses?: Status[]) {
  const { rows } = statuses?.length
    ? await db.query<ApplicationRow>(`${APP_SELECT} WHERE a.user_id = $1 AND a.status = ANY($2) ORDER BY a.updated_at DESC`, [userId, statuses])
    : await db.query<ApplicationRow>(`${APP_SELECT} WHERE a.user_id = $1 ORDER BY a.updated_at DESC`, [userId]);
  return rows;
}

export async function getApplication(db: Db, userId: string, id: number) {
  const { rows } = await db.query<ApplicationRow>(`${APP_SELECT} WHERE a.user_id = $1 AND a.id = $2`, [userId, id]);
  return rows[0] ?? null;
}

// TR-01: only allowed moves; every move is recorded.
export async function setStatus(db: Db, userId: string, id: number, to: Status, note?: string | null) {
  const app = await getApplication(db, userId, id);
  if (!app) throw new AppError("NOT_FOUND", "Application not found.");
  if (!canMove(app.status, to)) throw new AppError("BAD_MOVE", `Can't move from ${app.status} to ${to}.`);
  await db.query(
    `UPDATE applications SET status = $3, note = COALESCE($4, note), updated_at = now(),
       applied_at = CASE WHEN $3 = 'applied' AND applied_at IS NULL THEN now() ELSE applied_at END
     WHERE user_id = $1 AND id = $2`, [userId, id, to, note ?? null]);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'status', $3)", [userId, id, JSON.stringify({ from: app.status, to, note: note ?? null })]);
}

export async function saveTailored(db: Db, userId: string, id: number, tailored: Tailored) {
  await db.query("UPDATE applications SET tailored = $3, updated_at = now() WHERE user_id = $1 AND id = $2", [userId, id, JSON.stringify(tailored)]);
}

export async function markNeedsAction(db: Db, userId: string, id: number, unresolved: { label: string; reason: string }[]) {
  await db.query("UPDATE applications SET status = 'needs_action', unresolved = $3, updated_at = now() WHERE user_id = $1 AND id = $2", [userId, id, JSON.stringify(unresolved)]);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'needs_action', $3)", [userId, id, JSON.stringify(unresolved)]);
}

export async function events(db: Db, userId: string, applicationId: number) {
  const { rows } = await db.query<{ kind: string; detail: unknown; created_at: Date }>(
    "SELECT kind, detail, created_at FROM events WHERE user_id = $1 AND application_id = $2 ORDER BY id", [userId, applicationId]);
  return rows;
}

// DP-03: what was sent where, for every submission.
export async function logSubmission(db: Db, userId: string, applicationId: number, targetUrl: string, payload: unknown) {
  await db.query("INSERT INTO submissions (user_id, application_id, target_url, payload) VALUES ($1, $2, $3, $4)", [userId, applicationId, targetUrl, JSON.stringify(payload)]);
}

export async function submissions(db: Db, userId: string, applicationId?: number) {
  const { rows } = applicationId
    ? await db.query("SELECT application_id, target_url, payload, sent_at FROM submissions WHERE user_id = $1 AND application_id = $2 ORDER BY id", [userId, applicationId])
    : await db.query("SELECT application_id, target_url, payload, sent_at FROM submissions WHERE user_id = $1 ORDER BY id", [userId]);
  return rows;
}

// The worker's next job: auto-submits, or (in review mode) the approval queue.
export async function nextForWorker(db: Db, userId: string, mode: "auto" | "review") {
  const statuses = mode === "auto" ? ["queued"] : ["needs_approval", "queued"];
  const { rows } = await db.query<ApplicationRow>(`${APP_SELECT} WHERE a.user_id = $1 AND a.status = ANY($2) ORDER BY a.score DESC, a.id LIMIT 1`, [userId, statuses]);
  return rows[0] ?? null;
}

export async function dashboardCounts(db: Db, userId: string) {
  const { rows } = await db.query<{ status: Status; n: string }>("SELECT status, count(*) AS n FROM applications WHERE user_id = $1 GROUP BY status", [userId]);
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<Status, number>>;
}

export async function lastSearch(db: Db, userId: string): Promise<UserRunSummary | null> {
  const { rows } = await db.query<{ summary: UserRunSummary }>("SELECT summary FROM search_runs WHERE user_id = $1", [userId]);
  return rows[0]?.summary ?? null;
}

// ---------- data rights (DP-01, DP-02) ----------

export async function exportAll(db: Db, userId: string) {
  const user = (await db.query("SELECT id, email, verified_at, created_at FROM users WHERE id = $1", [userId])).rows[0];
  return {
    exportedAt: new Date().toISOString(),
    account: user,
    profile: await getProfile(db, userId),
    boards: await listBoards(db, userId),
    applications: await listApplications(db, userId),
    events: (await db.query("SELECT application_id, kind, detail, created_at FROM events WHERE user_id = $1 ORDER BY id", [userId])).rows,
    submissions: await submissions(db, userId),
  };
}

export async function deleteAccount(db: Db, userId: string) {
  // Everything personal references users ON DELETE CASCADE. Shared job listings stay; they hold no user data.
  await db.query("DELETE FROM users WHERE id = $1", [userId]);
}

// ---------- the search pipeline's view of the database ----------

export class PgPipelineStore implements PipelineStore {
  // onlyUserId: a "search now" for one user, using only that user's company list.
  constructor(private db: Db, private day: string, private onlyUserId: string | null = null) {}

  async activeUsers() {
    const { rows } = await this.db.query<{ user_id: string; data: Partial<Profile> }>(
      "SELECT p.user_id, p.data FROM profiles p JOIN users u ON u.id = p.user_id WHERE u.verified_at IS NOT NULL AND ($1::uuid IS NULL OR u.id = $1)", [this.onlyUserId]);
    return rows.map((r) => ({ userId: r.user_id, profile: withDefaults(r.data) })).filter((u) => !u.profile.paused && u.profile.experience.length > 0);
  }

  async allBoards() {
    const { rows } = await this.db.query<Board>(
      "SELECT DISTINCT ON (ats, board) ats, board, company FROM boards WHERE active AND ($1::uuid IS NULL OR user_id = $1) ORDER BY ats, board", [this.onlyUserId]);
    return rows;
  }

  async fetchCount(key: string, day: string) {
    const { rows } = await this.db.query<{ count: number }>("SELECT count FROM source_fetches WHERE key = $1 AND day = $2", [key, day]);
    return rows[0]?.count ?? 0;
  }

  async recordFetch(key: string, day: string) {
    await this.db.query("INSERT INTO source_fetches (key, day, count) VALUES ($1, $2, 1) ON CONFLICT (key, day) DO UPDATE SET count = source_fetches.count + 1", [key, day]);
  }

  async saveJobs(jobs: Job[]) {
    const out = new Map<string, number>();
    for (const j of jobs) {
      const { rows } = await this.db.query<{ id: number }>(
        `INSERT INTO jobs (source, source_id, company, title, location, remote, url, description, employment_type, salary, ats, attribution, posted_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (source, source_id) DO UPDATE SET title = EXCLUDED.title, location = EXCLUDED.location, description = EXCLUDED.description
         RETURNING id`,
        [j.source, j.sourceId, j.company, j.title, j.location, j.remote, j.url, j.description, j.employmentType, j.salary ? JSON.stringify(j.salary) : null, j.ats, j.attribution, j.postedAt]);
      out.set(`${j.source}:${j.sourceId}`, rows[0].id);
    }
    return out;
  }

  async hasApplication(userId: string, key: string) {
    const { rows } = await this.db.query("SELECT 1 FROM applications WHERE user_id = $1 AND dedupe_key = $2", [userId, key]);
    return rows.length > 0;
  }

  async createdOn(userId: string, day: string) {
    const { rows } = await this.db.query<{ n: string }>("SELECT count(*) AS n FROM applications WHERE user_id = $1 AND created_day = $2", [userId, day]);
    return Number(rows[0].n);
  }

  async recordRun(userId: string, summary: UserRunSummary) {
    await this.db.query("INSERT INTO search_runs (user_id, summary, updated_at) VALUES ($1, $2, now()) ON CONFLICT (user_id) DO UPDATE SET summary = EXCLUDED.summary, updated_at = now()", [userId, JSON.stringify(summary)]);
  }

  async createApplication(a: NewApplication) {
    const { rows } = await this.db.query<{ id: number }>(
      `INSERT INTO applications (user_id, job_id, dedupe_key, region, mode, countries, score, breakdown, route, status, flags, tailored, created_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id, dedupe_key) DO NOTHING RETURNING id`,
      [a.userId, a.jobId, a.dedupeKey, a.region, a.mode, a.countries, a.score, JSON.stringify(a.breakdown), a.route, a.status, JSON.stringify(a.flags), JSON.stringify(a.tailored), this.day]);
    if (!rows.length) return -1;
    await this.db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'created', $3)", [a.userId, rows[0].id, JSON.stringify({ route: a.route, score: a.score })]);
    return rows[0].id;
  }
}
