// The link in the verification email (AU-02).
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/mailer";
import { SESSION_COOKIE } from "@/lib/session";
import { verifyEmail } from "@/lib/store";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const userId = token ? await verifyEmail(await getDb(), token) : null;
  if (!userId) return NextResponse.redirect(`${appUrl()}/login?expired=1`);
  // Opened on a device that isn't signed in: log in next.
  return NextResponse.redirect(`${appUrl()}${req.cookies.has(SESSION_COOKIE) ? "/?welcome=1" : "/login?verified=1"}`);
}
