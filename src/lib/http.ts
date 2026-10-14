// Shared checks for API routes.
import { timingSafeEqual } from "node:crypto";

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

export const json = (body: unknown, status = 200) => Response.json(body, { status });
