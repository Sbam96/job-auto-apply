"use client";
import { useActionState } from "react";
import { addBoardAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Card, Field } from "@/components/ui";

export function AddBoard() {
  const [state, action] = useActionState<FormState, FormData>(addBoardAction, null);
  return (
    <Card title="Add a company">
      <form action={action} className="space-y-4">
        <Field label="Company name" htmlFor="company"><input id="company" name="company" className="input" placeholder="GitLab" /></Field>
        <Field label="Their jobs system" hint="Shown in the careers page link: greenhouse.io, lever.co or ashbyhq.com." htmlFor="ats">
          <select id="ats" name="ats" className="input" defaultValue="greenhouse">
            <option value="greenhouse">Greenhouse</option>
            <option value="lever">Lever</option>
            <option value="ashby">Ashby</option>
          </select>
        </Field>
        <Field label="Board name or careers link" hint="e.g. gitlab, or https://job-boards.greenhouse.io/gitlab" htmlFor="board"><input id="board" name="board" required className="input" /></Field>
        <FormMessage state={state} />
        <SubmitButton pending="Adding…">Add company</SubmitButton>
      </form>
    </Card>
  );
}
