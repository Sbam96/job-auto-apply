// Sign in with Google: token checks (unit) and account linking (database).
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { authUrl, exchangeCode, identityFromIdToken } from "@/lib/google";
import { openDb, type Db } from "@/lib/db";
import * as store from "@/lib/store";

const NOW = new Date("2026-10-13T21:00:00Z");
const CLIENT = "client-123.apps.googleusercontent.com";
const token = (claims: Record<string, unknown>) =>
  `x.${Buffer.from(JSON.stringify({ iss: "https://accounts.google.com", aud: CLIENT, sub: "g-1", email: "Ste@Gmail.com", email_verified: true, name: "Ste Example", exp: NOW.getTime() / 1000 + 600, ...claims })).toString("base64url")}.sig`;

describe("AU-05 Google token checks", () => {
  test("AU-05 a valid Google ID token gives the verified email, lower-cased", () => {
    expect(identityFromIdToken(token({}), CLIENT, NOW)).toEqual({ sub: "g-1", email: "ste@gmail.com", name: "Ste Example" });
  });
  test("AU-05 tokens for another app, from another issuer, expired, or unverified are refused", () => {
    expect(() => identityFromIdToken(token({ aud: "someone-else" }), CLIENT, NOW)).toThrow(/different app/);
    expect(() => identityFromIdToken(token({ iss: "https://evil.example" }), CLIENT, NOW)).toThrow(/didn't come from Google/);
    expect(() => identityFromIdToken(token({ exp: NOW.getTime() / 1000 - 1 }), CLIENT, NOW)).toThrow(/expired/);
    expect(() => identityFromIdToken(token({ email_verified: false }), CLIENT, NOW)).toThrow(/isn't verified/);
  });
  test("AU-05 only name and email are asked for", () => {
    const url = new URL(authUrl(CLIENT, "https://app.example/auth/google/callback", "state-xyz"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-xyz");
  });
  test("AU-05 the code is exchanged at Google's token endpoint", async () => {
    let called = "";
    const fetchImpl = (async (url: string) => { called = url; return new Response(JSON.stringify({ id_token: token({}) })); }) as unknown as typeof fetch;
    const id = await exchangeCode("code-1", { clientId: CLIENT, clientSecret: "s", redirectUri: "https://app.example/cb", fetchImpl, now: NOW });
    expect(called).toBe("https://oauth2.googleapis.com/token");
    expect(id.email).toBe("ste@gmail.com");
  });
});

const URL_DB = process.env.TEST_DATABASE_URL;
const d = URL_DB ? describe : describe.skip;
let db: Db;
beforeAll(async () => { if (URL_DB) db = await openDb(URL_DB); });
afterAll(async () => { if (db) await db.close(); });

d("AU-05 Google accounts", () => {
  test("AU-05 a first Google sign-in creates a verified account with the name filled in", async () => {
    const { user, created } = await store.googleUser(db, { sub: "g-new", email: "newperson@gmail.com", name: "New Person" });
    expect(created).toBe(true);
    expect((await store.login(db, "newperson@gmail.com", "anything at all")) ).toBeNull(); // no known password
    const { rows } = await db.query("SELECT verified_at FROM users WHERE id = $1", [user.id]);
    expect(rows[0].verified_at).not.toBeNull();
    expect((await store.getProfile(db, user.id)).fullName).toBe("New Person");
    expect((await store.listBoards(db, user.id)).length).toBeGreaterThan(0);
  });
  test("AU-05 signing in again finds the same account", async () => {
    const a = await store.googleUser(db, { sub: "g-new", email: "newperson@gmail.com", name: "New Person" });
    expect(a.created).toBe(false);
  });
  test("AU-05 an existing email-and-password account is linked, and verified, by Google sign-in", async () => {
    const { user } = await store.createUser(db, "linkme@gmail.com", "a long enough password");
    const g = await store.googleUser(db, { sub: "g-link", email: "LinkMe@gmail.com", name: "" });
    expect(g.created).toBe(false);
    expect(g.user.id).toBe(user.id);
    expect((await store.login(db, "linkme@gmail.com", "a long enough password"))!.verifiedAt).not.toBeNull();
  });
});
