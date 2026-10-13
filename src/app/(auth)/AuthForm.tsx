"use client";
import { useActionState } from "react";
import Link from "next/link";
import { loginAction, signupAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { buttonClass } from "@/components/ui";

export function AuthForm({ mode, notice }: { mode: "signup" | "login"; notice?: string }) {
  const [state, action] = useActionState<FormState, FormData>(mode === "signup" ? signupAction : loginAction, null);
  const signup = mode === "signup";
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">{signup ? "Create your account" : "Log in"}</h1>
      <p className="mt-1 text-sm text-muted">{signup ? "You'll confirm your email before anything is searched or sent." : "Welcome back."}</p>
      {notice && <p role="status" className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">{notice}</p>}
      <form action={action} className="mt-5 space-y-4">
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
