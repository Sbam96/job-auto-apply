// DP-01: download everything held about the signed-in user.
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";
import { exportAll, userForSession } from "@/lib/store";

export async function GET() {
  const db = await getDb();
  const user = await userForSession(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return new Response("Log in first.", { status: 401 });
  const data = await exportAll(db, user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="job-auto-apply-export-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
