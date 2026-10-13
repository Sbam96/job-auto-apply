"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { buttonClass } from "@/components/ui";

export function AuthForm({ mode, notice, google = false }: { mode: "signup" | "login"; notice?: string; google?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "signup" ? signupAction : loginAction, null);
  const signup = mode === "signup";
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">{signup ? "Create your account" : "Log in"}</h1>
      <p className="mt-1 text-sm text-muted">{signup ? "You'll confirm your email before anything is searched or sent." : "Welcome back."}</p>
      {notice && <p role="status" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{notice}</p>}
      {google && (
        <>
          <a href="/auth/google" className="mt-5 flex w-full items-center justify-center gap-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm font-semibold transition-colors hover:border-accent">
            <svg aria-hidden width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </a>
          <p className="my-4 text-center text-xs text-muted">or use your email</p>
        </>
      )}
      <form action={action} className={google ? "space-y-4" : "mt-5 space-y-4"}>
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 10 : undefined} className="input" />
          {signup && <p className="text-xs text-muted">At least 10 characters.</p>}
        </div>
        <FormMessage state={state} />
        <SubmitButton className={`${buttonClass} w-full`} pending={signup ? "Creating…" : "Logging in…"}>{signup ? "Create account" : "Log in"}</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        {signup ? <>Already have an account? <Link href="/login" className="font-medium text-accent">Log in</Link></> : <>New here? <Link href="/signup" className="font-medium text-accent">Create an account</Link></>}
      </p>
    </div>
  );
}
