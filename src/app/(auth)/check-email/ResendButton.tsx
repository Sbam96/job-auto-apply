"use client";
import { useActionState } from "react";
import { resendVerificationAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { secondaryButtonClass } from "@/components/ui";

export function ResendButton() {
  const [state, action] = useActionState<FormState, FormData>(() => resendVerificationAction(), null);
  return (
    <form action={action} className="space-y-2">
      <SubmitButton className={secondaryButtonClass} pending="Sending…">Send the link again</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
