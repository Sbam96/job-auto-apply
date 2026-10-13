// Google sends the user back here after they choose an account.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { exchangeCode } from "@/lib/google";
import { appUrl } from "@/lib/mailer";
import { setSessionCookie } from "@/lib/session";
import { createSession, googleUser } from "@/lib/store";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const expected = jar.get("jaa_oauth_state")?.value;
  jar.delete("jaa_oauth_state");
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || !expected || state !== expected) return NextResponse.redirect(`${appUrl()}/login?google=failed`);
  try {
    const identity = await exchangeCode(code, { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, redirectUri: `${appUrl()}/auth/google/callback` });
    const db = await getDb();
    const { user, created } = await googleUser(db, identity);
    await setSessionCookie(await createSession(db, user.id));
    return NextResponse.redirect(`${appUrl()}/${created ? "?welcome=1" : ""}`);
  } catch (err) {
    console.error("[google] sign-in failed:", (err as Error).message);
    return NextResponse.redirect(`${appUrl()}/login?google=failed`);
  }
}
