"use client";
import { useActionState } from "react";
import { searchNowAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";

export function SearchNow() {
  const [state, action] = useActionState<FormState, FormData>(() => searchNowAction(), null);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <SubmitButton pending="Searching… this can take a minute">Search now</SubmitButton>
      <div className="max-w-md text-right"><FormMessage state={state} /></div>
    </form>
  );
}
