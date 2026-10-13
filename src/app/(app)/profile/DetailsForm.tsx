"use client";
import { useActionState } from "react";
import { saveDetailsAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import type { Profile } from "@/lib/types";

const SELF_ID: { key: keyof Profile["selfId"]; label: string }[] = [
  { key: "veteran", label: "Veteran status" },
  { key: "disability", label: "Disability status" },
  { key: "race", label: "Race / ethnicity" },
  { key: "gender", label: "Gender" },
];

export function DetailsForm({ profile: p, immigration }: { profile: Profile; immigration: { short: string; long: string } }) {
  const [state, action] = useActionState<FormState, FormData>(saveDetailsAction, null);
  const text = (name: string, label: string, value: string, opts: { type?: string; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} hint={opts.hint} htmlFor={name}>
      <input id={name} name={name} type={opts.type ?? "text"} defaultValue={value} placeholder={opts.placeholder} className="input" />
    </Field>
  );
  return (
    <form action={action} className="space-y-6">
      <Card title="Contact details">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("fullName", "Full name", p.fullName)}
          {text("contactEmail", "Email for applications", p.contactEmail, { type: "email" })}
          {text("phone", "Phone", p.phone, { type: "tel", placeholder: "+44 …" })}
          {text("homeCity", "Where you're based", p.homeCity, { placeholder: "Manchester, UK" })}
          {text("linkedin", "LinkedIn", p.linkedin, { type: "url" })}
          {text("portfolio", "Portfolio or website", p.portfolio, { type: "url" })}
        </div>
      </Card>

      <Card title="Stored answers">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("expectedUsd", "Expected salary (USD a year)", p.expectedSalary.usd?.toString() ?? "", { hint: "Used for US and Canadian roles.", placeholder: "110000" })}
          {text("expectedGbp", "Expected salary (GBP a year)", p.expectedSalary.gbp?.toString() ?? "", { hint: "Used for UK and EMEA roles.", placeholder: "60000" })}
          {text("noticePeriod", "Notice period / start date", p.noticePeriod, { placeholder: "1 month" })}
          {text("usHoursOverlap", "US-hours overlap", p.usHoursOverlap, { placeholder: "Available until 8pm UK time" })}
        </div>
      </Card>

      <Card title="Voluntary self-identification">
        <p className="mb-4 text-sm text-muted">US forms often ask these. They&apos;re optional and shouldn&apos;t affect your application. Each defaults to &ldquo;prefer not to say&rdquo;; only change one if you want to answer it.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {SELF_ID.map(({ key, label }) => (
            <Field key={key} label={label} htmlFor={`selfId.${key}`}>
              <input id={`selfId.${key}`} name={`selfId.${key}`} defaultValue={p.selfId[key] === "prefer_not" ? "" : p.selfId[key]} placeholder="Prefer not to say" className="input" />
            </Field>
          ))}
        </div>
      </Card>

      <Card title="Your writing voice">
        <Field label="Writing samples" hint="Paste up to 3 things you've written (a cover letter, LinkedIn summary, a work email). Separate them with a line of three dashes: ---" htmlFor="writingSamples">
          <textarea id="writingSamples" name="writingSamples" rows={8} defaultValue={p.writingSamples.join("\n---\n")} className="input" />
        </Field>
      </Card>

      <Card title="Immigration text for US roles">
        <p className="mb-3 text-sm text-muted">Used word for word, only on US roles, in a context box or cover letter. The AI can choose the version but never reword it.</p>
        <p className="text-sm"><span className="font-medium">Long: </span>{immigration.long}</p>
        <p className="mt-2 text-sm"><span className="font-medium">Short: </span>{immigration.short}</p>
      </Card>

      <div className="flex items-center gap-4"><SubmitButton>Save details</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
