"use client";
// Client pieces for forms: a submit button that shows progress, and a saved/error message.
import { useFormStatus } from "react-dom";
import { buttonClass } from "./ui";
import type { FormState } from "@/app/actions";

export function SubmitButton({ children, pending, className = buttonClass }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" disabled={busy} className={className}>
      {busy ? pending ?? "Saving…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-good" : "text-bad"}`}>
      {state.message}
    </p>
  );
}
