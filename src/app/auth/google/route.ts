// Starts "Sign in with Google": a one-time state value guards against forged callbacks.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { newToken } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/google";
import { appUrl } from "@/lib/mailer";

export async function GET() {
  if (!googleConfigured()) return NextResponse.redirect(`${appUrl()}/login`);
  const state = newToken();
  (await cookies()).set("jaa_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600 });
  return NextResponse.redirect(authUrl(process.env.GOOGLE_CLIENT_ID!, `${appUrl()}/auth/google/callback`, state));
}
