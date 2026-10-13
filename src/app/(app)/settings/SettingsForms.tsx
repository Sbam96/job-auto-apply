"use client";
import { useActionState } from "react";
import { deleteAccountAction, workerTokenAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { dangerButtonClass, secondaryButtonClass } from "@/components/ui";

export function WorkerToken() {
  const [state, action] = useActionState<FormState, FormData>(() => workerTokenAction(), null);
  return (
    <form action={action} className="space-y-3">
      <SubmitButton className={secondaryButtonClass} pending="Generating…">Generate worker key</SubmitButton>
      {state?.ok && (
        <div className="rounded-lg bg-canvas p-3">
          <p className="mb-1 text-xs text-muted">Copy it now; it won&apos;t be shown again. Put it in the worker&apos;s .env as WORKER_TOKEN.</p>
          <code className="break-all text-sm" data-worker-token>{state.message}</code>
        </div>
      )}
    </form>
  );
}

export function DeleteAccount() {
  const [state, action] = useActionState<FormState, FormData>(deleteAccountAction, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">Type DELETE to confirm<input name="confirm" className="input mt-1 w-48" autoComplete="off" /></label>
      <SubmitButton className={dangerButtonClass} pending="Deleting…">Delete my account</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
