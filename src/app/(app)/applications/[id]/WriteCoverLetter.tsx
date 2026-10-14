"use client";
// DOC-06: ask for a cover letter on a match that didn't get one automatically.
import { useActionState } from "react";
import { writeCoverLetterAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { secondaryButtonClass } from "@/components/ui";

export function WriteCoverLetter({ id, again = false }: { id: number; again?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(writeCoverLetterAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton className={secondaryButtonClass} pending="Writing…">{again ? "Write it again" : "Write a cover letter"}</SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
