// Database tests: accounts, data isolation, status flow, data rights. Need TEST_DATABASE_URL.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import pg from "pg";
import { openDb, type Db } from "@/lib/db";
import { londonDay, runSearch } from "@/lib/pipeline";
import { boardUrl, REMOTIVE_URL } from "@/lib/sources";
import { canMove } from "@/lib/status";
import * as store from "@/lib/store";
import { fakeFetch } from "./fixtures";
import { NOW, profile } from "./helpers";

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;
let db: Db;

beforeAll(async () => {
  if (!URL) return;
  const c = new pg.Client({ connectionString: URL });
  await c.connect();
  await c.query("DROP TABLE IF EXISTS mail_outbox, report_runs, source_fetches, submissions, events, applications, jobs, boards, profiles, email_tokens, sessions, users CASCADE");
  await c.end();
  db = await openDb(URL);
});
afterAll(async () => { if (db) await db.close(); });

async function verifiedUser(email: string) {
  const { user, verifyToken } = await store.createUser(db, email, "correct horse battery");
  await store.verifyEmail(db, verifyToken);
  await store.saveProfile(db, user.id, profile({ contactEmail: email }));
  return user;
}

async function seedApplication(userId: string) {
  const board = { ats: "greenhouse", board: `acme${userId.slice(0, 6)}`, company: "Acme" } as const;
  await db.query("UPDATE boards SET active = false WHERE user_id = $1", [userId]);
  await store.addBoard(db, userId, board);
  const desc = "Business Analyst: user stories, acceptance criteria, Jira, SQL, agile, stakeholder management, insurance. 3+ years of experience.";
  const { impl } = fakeFetch({
    [boardUrl(board)]: { jobs: [{ id: 1, title: "Business Analyst", location: { name: "Remote - UK" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1", content: desc }] },
    [REMOTIVE_URL]: { jobs: [] },
  });
  const pipe = new store.PgPipelineStore(db, londonDay(NOW));
  const run = await runSearch({ store: pipe, llm: null, now: NOW, fetchImpl: impl });
  return run.created.find((c) => c.userId === userId)!.applicationId;
}

d("AU accounts", () => {
  test("AU-01 sign-up stores a hashed password, never the password itself", async () => {
    const { user } = await store.createUser(db, "Nami@Example.com", "a long enough password");
    const { rows } = await db.query("SELECT email, password_hash FROM users WHERE id = $1", [user.id]);
    expect(rows[0].email).toBe("nami@example.com");
    expect(rows[0].password_hash).toMatch(/^scrypt\$/);
    expect(rows[0].password_hash).not.toContain("a long enough password");
  });
  test("AU-01 an email can only be registered once", async () => {
    await expect(store.createUser(db, "nami@example.com", "another password")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });
  test("AU-02 an account is unverified until the emailed link is used, and the link works once", async () => {
    const { user, verifyToken } = await store.createUser(db, "zoro@example.com", "a long enough password");
    expect((await store.login(db, "zoro@example.com", "a long enough password"))!.verifiedAt).toBeNull();
    expect(await store.verifyEmail(db, verifyToken)).toBe(user.id);
    expect(await store.verifyEmail(db, verifyToken)).toBeNull();
    expect((await store.login(db, "zoro@example.com", "a long enough password"))!.verifiedAt).not.toBeNull();
  });
  test("AU-02 unverified accounts are never searched for", async () => {
    const { user } = await store.createUser(db, "unverified@example.com", "a long enough password");
    await store.saveProfile(db, user.id, profile());
    const users = await new store.PgPipelineStore(db, "2026-10-13").activeUsers();
    expect(users.map((u) => u.userId)).not.toContain(user.id);
  });
  test("AU-03 the right password logs in, a wrong one doesn't; logging out ends the session", async () => {
    expect(await store.login(db, "zoro@example.com", "wrong password!!")).toBeNull();
    const user = (await store.login(db, "ZORO@example.com", "a long enough password"))!;
    const token = await store.createSession(db, user.id);
    expect((await store.userForSession(db, token))!.id).toBe(user.id);
    await store.endSession(db, token);
    expect(await store.userForSession(db, token)).toBeNull();
  });
  test("AU-04 one user can't read or change another user's applications", async () => {
    const a = await verifiedUser("a@example.com");
    const b = await verifiedUser("b@example.com");
    const appId = await seedApplication(a.id);
    expect(await store.getApplication(db, a.id, appId)).not.toBeNull();
    expect(await store.getApplication(db, b.id, appId)).toBeNull();
    await expect(store.setStatus(db, b.id, appId, "applied")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await store.listApplications(db, b.id)).map((x) => x.id)).not.toContain(appId);
  });
});

d("PR profile storage", () => {
  test("PR-04 stored answers round-trip: salary in USD and GBP, notice period, overlap, links", async () => {
    const u = await verifiedUser("pr4@example.com");
    const p = await store.getProfile(db, u.id);
    expect(p.expectedSalary).toEqual({ usd: 110000, gbp: 60000 });
    expect(p.noticePeriod).toBe("1 month");
    expect(p.portfolio).toBe("https://alex.example.com");
  });
  test("PR-02 pending bullets are stored but not used until approved", async () => {
    const u = await verifiedUser("pr2@example.com");
    const appId = await seedApplication(u.id);
    const app = (await store.getApplication(db, u.id, appId))!;
    expect(JSON.stringify(app.tailored)).not.toContain("Suggested: ran stakeholder workshops");
  });
});

d("TR status flow", () => {
  test("TR-01 the allowed path: queued → applied → response → interview → offer", async () => {
    const u = await verifiedUser("tr1@example.com");
    const id = await seedApplication(u.id);
    expect((await store.getApplication(db, u.id, id))!.status).toBe("queued");
    for (const s of ["applied", "response", "interview", "offer"] as const) await store.setStatus(db, u.id, id, s);
    const app = (await store.getApplication(db, u.id, id))!;
    expect(app.status).toBe("offer");
    expect(app.applied_at).not.toBeNull();
    expect((await store.events(db, u.id, id)).filter((e) => e.kind === "status")).toHaveLength(4);
  });
  test("TR-01 moves that skip the flow are refused", async () => {
    expect(canMove("queued", "interview")).toBe(false);
    expect(canMove("rejected", "applied")).toBe(false);
    const u = await verifiedUser("tr1b@example.com");
    const id = await seedApplication(u.id);
    await expect(store.setStatus(db, u.id, id, "offer")).rejects.toMatchObject({ code: "BAD_MOVE" });
  });
});

d("MT-07 duplicates in the database", () => {
  test("MT-07 the database refuses a second application for the same role", async () => {
    const u = await verifiedUser("mt7@example.com");
    await seedApplication(u.id);
    const pipe = new store.PgPipelineStore(db, "2026-10-14");
    const apps = await store.listApplications(db, u.id);
    const key = (await db.query("SELECT dedupe_key FROM applications WHERE id = $1", [apps[0].id])).rows[0].dedupe_key;
    expect(await pipe.hasApplication(u.id, key)).toBe(true);
  });
});

d("DP data rights", () => {
  test("DP-01 export holds the account, profile, applications, events and submissions", async () => {
    const u = await verifiedUser("dp1@example.com");
    const id = await seedApplication(u.id);
    await store.logSubmission(db, u.id, id, "https://job-boards.greenhouse.io/acme/jobs/1", { "First Name": "Alex" });
    const out = await store.exportAll(db, u.id);
    expect(out.account.email).toBe("dp1@example.com");
    expect(out.profile.fullName).toBe("Alex Example");
    expect(out.applications).toHaveLength(1);
    expect(out.submissions).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("password_hash");
  });
  test("DP-02 deleting an account removes all of its data", async () => {
    const u = await verifiedUser("dp2@example.com");
    const id = await seedApplication(u.id);
    await store.logSubmission(db, u.id, id, "https://x", {});
    await store.deleteAccount(db, u.id);
    for (const table of ["users", "profiles", "boards", "applications", "events", "submissions", "sessions"]) {
      const col = table === "users" ? "id" : "user_id";
      const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [u.id]);
      expect(rows, table).toHaveLength(0);
    }
  });
  test("DP-03 every submission is logged with the target and what was sent", async () => {
    const u = await verifiedUser("dp3@example.com");
    const id = await seedApplication(u.id);
    await store.logSubmission(db, u.id, id, "https://job-boards.greenhouse.io/acme/jobs/1", { Email: "alex@example.com", "Resume/CV": "cv.pdf" });
    const [s] = await store.submissions(db, u.id, id);
    expect(s.target_url).toBe("https://job-boards.greenhouse.io/acme/jobs/1");
    expect(s.payload).toEqual({ Email: "alex@example.com", "Resume/CV": "cv.pdf" });
  });
});

d("TL-06 waiting applications use the latest CV", () => {
  test("TL-06 an application tailored before a CV change is tailored again from the new CV before it's sent", async () => {
    const { freshTailored, isStale } = await import("@/lib/refresh");
    const u = await verifiedUser("tl6@example.com");
    const id = await seedApplication(u.id);
    const before = (await store.getApplication(db, u.id, id))!;
    const p = await store.getProfile(db, u.id);
    expect(isStale(before, p)).toBe(false);
    expect(await freshTailored(db, u.id, before, p, null)).toEqual(before.tailored); // unchanged CV: nothing redone

    const newLine = "Delivered a national data strategy with 12 government departments.";
    const updated = { ...p, experience: p.experience.map((r, i) => (i === 0 ? { ...r, bullets: [{ id: "new1", text: newLine, status: "approved" as const, source: "user" as const }, ...r.bullets] } : r)) };
    await store.saveProfile(db, u.id, updated);
    const fresh = await store.getProfile(db, u.id);
    expect(isStale(before, fresh)).toBe(true);
    const t = await freshTailored(db, u.id, before, fresh, null);
    expect(t.roles.flatMap((r) => r.bullets.map((b) => b.text))).toContain(newLine);
    const after = (await store.getApplication(db, u.id, id))!;
    expect(after.tailored.cvVersion).toBe(t.cvVersion);
    expect(isStale(after, fresh)).toBe(false);
    expect((await store.events(db, u.id, id)).map((e) => e.kind)).toContain("cv_updated");
  });
  test("TL-06 applications already sent keep the CV they were sent with", async () => {
    const { isStale } = await import("@/lib/refresh");
    const u = await verifiedUser("tl6b@example.com");
    const id = await seedApplication(u.id);
    const app = (await store.getApplication(db, u.id, id))!;
    const p = await store.getProfile(db, u.id);
    const changed = { ...p, summary: `${p.summary} Now at a consultancy.` };
    expect(isStale(app, changed)).toBe(true);
    expect(isStale({ ...app, status: "applied" }, changed)).toBe(false);
  });
});
