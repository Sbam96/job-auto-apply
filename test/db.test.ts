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
  await c.query("DROP TABLE IF EXISTS mail_outbox, report_runs, digest_runs, search_runs, source_fetches, submissions, events, applications, jobs, boards, profiles, email_tokens, sessions, users CASCADE");
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

async function seedApplication(userId: string, company = "Acme") {
  const board = { ats: "greenhouse", board: `${company.toLowerCase()}${userId.slice(0, 6)}`, company } as const;
  await db.query("UPDATE boards SET active = false WHERE user_id = $1", [userId]);
  await store.addBoard(db, userId, board);
  const desc = "Business Analyst: user stories, acceptance criteria, Jira, SQL, agile, stakeholder management, insurance. 3+ years of experience.";
  const { impl } = fakeFetch({
    [boardUrl(board)]: { jobs: [{ id: 1, title: "Business Analyst", location: { name: "Remote - UK" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/1", content: desc }] },
    [REMOTIVE_URL]: { jobs: [] },
  });
  const pipe = new store.PgPipelineStore(db, londonDay(NOW));
  const run = await runSearch({ store: pipe, llm: null, now: NOW, fetchImpl: impl });
  return run.created.find((c) => c.userId === userId && c.company === company)!.applicationId;
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
  test("TR-01 the allowed path: ready → applied → heard back → interview → offer", async () => {
    const u = await verifiedUser("tr1@example.com");
    const id = await seedApplication(u.id);
    expect((await store.getApplication(db, u.id, id))!.status).toBe("new");
    for (const s of ["applied", "response", "interview", "offer"] as const) await store.setStatus(db, u.id, id, s);
    const app = (await store.getApplication(db, u.id, id))!;
    expect(app.status).toBe("offer");
    expect(app.applied_at).not.toBeNull();
    expect((await store.events(db, u.id, id)).filter((e) => e.kind === "status")).toHaveLength(4);
  });
  test("TR-01 moves that skip the flow are refused; a mistaken 'applied' can be undone", async () => {
    expect(canMove("new", "interview")).toBe(false);
    expect(canMove("rejected", "applied")).toBe(false);
    const u = await verifiedUser("tr1b@example.com");
    const id = await seedApplication(u.id);
    await expect(store.setStatus(db, u.id, id, "offer")).rejects.toMatchObject({ code: "BAD_MOVE" });
    await store.setStatus(db, u.id, id, "applied");
    await store.setStatus(db, u.id, id, "new");
    expect((await store.getApplication(db, u.id, id))!.applied_at).toBeNull();
  });
});

d("MT-07 duplicates in the database", () => {
  test("MT-07 an open match blocks a second one; an application older than 3 months doesn't", async () => {
    const u = await verifiedUser("mt7@example.com");
    const id = await seedApplication(u.id);
    const pipe = new store.PgPipelineStore(db, "2026-10-14");
    const key = (await db.query("SELECT dedupe_key FROM applications WHERE id = $1", [id])).rows[0].dedupe_key;
    const since = new Date(Date.now() - 91 * 86400000);
    expect(await pipe.hasApplication(u.id, key, since)).toBe(true);
    await store.setStatus(db, u.id, id, "applied");
    expect(await pipe.hasApplication(u.id, key, since)).toBe(true);
    await db.query("UPDATE applications SET applied_at = now() - interval '100 days' WHERE id = $1", [id]);
    expect(await pipe.hasApplication(u.id, key, since)).toBe(false);
  });
});

d("RT keeping and deleting", () => {
  const day = 86400000;
  test("RT-01 a match left alone for 30 days expires", async () => {
    const u = await verifiedUser("rt1@example.com");
    const id = await seedApplication(u.id);
    await db.query("UPDATE applications SET updated_at = now() - interval '31 days' WHERE id = $1", [id]);
    await store.housekeeping(db, new Date());
    expect((await store.getApplication(db, u.id, id))!.status).toBe("expired");
  });
  test("RT-02 six months after applying, the CV, cover letter and record are deleted", async () => {
    const u = await verifiedUser("rt2@example.com");
    const keep = await seedApplication(u.id);
    await store.setStatus(db, u.id, keep, "applied");
    const old = await seedApplication(u.id, "Oldco");
    await store.setStatus(db, u.id, old, "applied");
    await store.setStatus(db, u.id, old, "interview");
    await db.query("UPDATE applications SET applied_at = $2 WHERE id = $1", [old, new Date(Date.now() - 184 * day)]);
    await store.housekeeping(db, new Date());
    expect(await store.getApplication(db, u.id, old)).toBeNull();
    expect((await db.query("SELECT 1 FROM events WHERE application_id = $1", [old])).rows).toHaveLength(0);
    expect(await store.getApplication(db, u.id, keep)).not.toBeNull();
  });
  test("RT-03 dismissed and expired matches are deleted after 3 months", async () => {
    const u = await verifiedUser("rt3@example.com");
    const id = await seedApplication(u.id);
    await store.setStatus(db, u.id, id, "dismissed");
    await db.query("UPDATE applications SET updated_at = now() - interval '92 days' WHERE id = $1", [id]);
    await store.housekeeping(db, new Date());
    expect(await store.getApplication(db, u.id, id)).toBeNull();
  });
  test("RT-04 applications from the old auto-apply flow are kept, as ready or not for me", async () => {
    const u = await verifiedUser("rt4@example.com");
    const a = await seedApplication(u.id);
    const b = await seedApplication(u.id, "Skipco");
    await db.query("UPDATE applications SET status = 'queued' WHERE id = $1", [a]);
    await db.query("UPDATE applications SET status = 'skipped' WHERE id = $1", [b]);
    const again = await openDb(URL!); // runs the migration
    await again.close();
    expect((await store.getApplication(db, u.id, a))!.status).toBe("new");
    expect((await store.getApplication(db, u.id, b))!.status).toBe("dismissed");
  });
});

d("DP data rights", () => {
  test("DP-01 export holds the account, profile, matches with their documents, and history", async () => {
    const u = await verifiedUser("dp1@example.com");
    await seedApplication(u.id);
    const out = await store.exportAll(db, u.id);
    expect(out.account.email).toBe("dp1@example.com");
    expect(out.profile.fullName).toBe("Alex Example");
    expect(out.applications).toHaveLength(1);
    expect(out.applications[0].tailored.roles.length).toBeGreaterThan(0);
    expect(JSON.stringify(out)).not.toContain("password_hash");
  });
  test("DP-02 deleting an account removes all of its data", async () => {
    const u = await verifiedUser("dp2@example.com");
    await seedApplication(u.id);
    await store.recordDigest(db, u.id, new Date());
    await store.deleteAccount(db, u.id);
    for (const table of ["users", "profiles", "boards", "applications", "events", "sessions", "digest_runs"]) {
      const col = table === "users" ? "id" : "user_id";
      const { rows } = await db.query(`SELECT 1 FROM ${table} WHERE ${col} = $1`, [u.id]);
      expect(rows, table).toHaveLength(0);
    }
  });
});

d("TL-06 matches use the latest CV", () => {
  test("TL-06 a match tailored before a CV change is tailored again from the new CV when you open it", async () => {
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
  test("TL-06 once applied, the documents stay as they were sent", async () => {
    const { isStale } = await import("@/lib/refresh");
    const u = await verifiedUser("tl6b@example.com");
    const id = await seedApplication(u.id);
    const app = (await store.getApplication(db, u.id, id))!;
    const p = await store.getProfile(db, u.id);
    const changed = { ...p, summary: `${p.summary} Now at a consultancy.` };
    expect(isStale(app, changed)).toBe(true);
    expect(isStale({ ...app, status: "applied" }, changed)).toBe(false);
  });
  test("DOC-04 text you edited is never replaced automatically; you're told the CV changed instead", async () => {
    const { editedButOutdated, freshTailored, isStale } = await import("@/lib/refresh");
    const u = await verifiedUser("doc4@example.com");
    const id = await seedApplication(u.id);
    const app = (await store.getApplication(db, u.id, id))!;
    await store.saveTailored(db, u.id, id, { ...app.tailored, summary: "My own summary.", edited: true });
    const edited = (await store.getApplication(db, u.id, id))!;
    const p = await store.getProfile(db, u.id);
    const changed = { ...p, summary: "A new master summary." };
    expect(isStale(edited, changed)).toBe(false);
    expect(editedButOutdated(edited, changed)).toBe(true);
    expect((await freshTailored(db, u.id, edited, changed, null)).summary).toBe("My own summary.");
  });
  test("DOC-06 a cover letter you ask for is written for a match that didn't need one, and marked as text only", async () => {
    const { tailorFor } = await import("@/lib/refresh");
    const { FakeLLM } = await import("@/lib/llm");
    const u = await verifiedUser("doc6@example.com");
    const id = await seedApplication(u.id); // a UK role: no cover letter by the rules
    const app = (await store.getApplication(db, u.id, id))!;
    expect(app.tailored.coverLetter).toBeNull();
    const llm = new FakeLLM((_s, prompt) => ({ roles: [], coverLetter: prompt.includes("cover letter") ? "I'd like to apply." : null }));
    const p = await store.getProfile(db, u.id);
    expect((await tailorFor(app, p, llm)).coverLetter).toBeNull();
    const asked = await tailorFor(app, p, llm, true);
    expect(asked).toMatchObject({ coverLetter: "I'd like to apply.", coverOnRequest: true });
    // Kept when the documents are refreshed later.
    expect((await tailorFor({ ...app, tailored: asked }, p, llm)).coverOnRequest).toBe(true);
  });
});
