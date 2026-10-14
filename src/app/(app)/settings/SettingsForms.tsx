"use client";
import { useActionState } from "react";
import { deleteAccountAction, saveNotificationsAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { dangerButtonClass, secondaryButtonClass } from "@/components/ui";

export function Notifications({ every, hour }: { every: 1 | 2; hour: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveNotificationsAction, null);
  const label = (h: number) => new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString("en-GB", { hour: "numeric", hour12: true, timeZone: "UTC" });
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">How often
        <select name="every" defaultValue={String(every)} className="input mt-1 w-44">
          <option value="1">Every day</option>
          <option value="2">Every two days</option>
        </select>
      </label>
      <label className="text-sm">At (UK time)
        <select name="hour" defaultValue={String(hour)} className="input mt-1 w-32">
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{label(h)}</option>)}
        </select>
      </label>
      <SubmitButton className={secondaryButtonClass}>Save</SubmitButton>
      <FormMessage state={state} />
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
