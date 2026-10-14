// Shared checks for API routes.
import { timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { userForExtension } from "./store";

const bearer = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? null;

// Scheduled runs (GitHub Actions) send CRON_SECRET.
export function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const given = bearer(req);
  if (!secret || !given || secret.length < 16) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// EX-01: the browser extension sends its connection key.
export async function extensionUser(req: Request) {
  return userForExtension(await getDb(), bearer(req));
}

export const json = (body: unknown, status = 200) => Response.json(body, { status });
