// Test-only: lets the browser tests read emails (e.g. the verification link).
// Only exists when E2E_HOOKS=1. Never set that in production.
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  if (process.env.E2E_HOOKS !== "1") return new Response("Not found", { status: 404 });
  const to = new URL(req.url).searchParams.get("to") ?? "";
  const { rows } = await (await getDb()).query("SELECT subject, body, created_at FROM mail_outbox WHERE to_email = $1 ORDER BY id DESC LIMIT 5", [to.toLowerCase()]);
  return Response.json({ mail: rows });
}
