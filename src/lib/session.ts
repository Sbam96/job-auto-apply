import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "./db";
import { userForSession, type User } from "./store";

export const SESSION_COOKIE = "jaa_session";

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForSession(await getDb(), token);
}

// AU-02: signed in and verified, or sent where they need to go.
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.verifiedAt) redirect("/check-email");
  return user;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
