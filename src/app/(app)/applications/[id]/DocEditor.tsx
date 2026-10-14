"use client";
// DOC-03 and DOC-04: edit the tailored CV and cover letter before downloading, or regenerate them.
// Titles, employers and dates come from your master CV and aren't editable here.
import { useActionState, useState } from "react";
import { regenerateAction, saveDocumentsAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { secondaryButtonClass } from "@/components/ui";
import type { Tailored } from "@/lib/tailor";

const monthYear = (ym: string | null) => {
  if (!ym) return "Present";
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
};

export function DocEditor({ id, tailored }: { id: number; tailored: Tailored }) {
  const [saved, save] = useActionState<FormState, FormData>(saveDocumentsAction, null);
  const [regen, regenerate] = useActionState<FormState, FormData>(regenerateAction, null);
  // Editing stays open until a save succeeds: `openedWith` is the save result when you pressed Edit.
  const [openedWith, setOpenedWith] = useState<FormState | undefined>(undefined);
  const editing = openedWith !== undefined && (saved === openedWith || !saved?.ok);
  const setEditing = (on: boolean) => setOpenedWith(on ? saved : undefined);
  const t = tailored;

  if (!editing) {
    return (
      <div className="space-y-4 text-sm">
        {t.summary && <p>{t.summary}</p>}
        {t.roles.map((r) => (
          <div key={r.id}>
            <p className="font-medium">{r.title}, {r.employer}</p>
            {r.team && <p>{r.team}</p>}
            <p className="text-xs text-muted">{monthYear(r.start)} to {monthYear(r.end)}</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">{r.bullets.map((b, i) => <li key={`${b.sourceId}-${i}`}>{b.text}</li>)}</ul>
          </div>
        ))}
        {t.skills.length > 0 && <p><span className="font-medium">Skills: </span>{t.skills.join(", ")}</p>}
        {t.coverLetter && (
          <div className="border-t border-line pt-4">
            <p className="mb-2 font-medium">Cover letter</p>
            <p className="whitespace-pre-wrap leading-relaxed">{t.coverLetter}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button type="button" className={secondaryButtonClass} onClick={() => setEditing(true)}>Edit the text</button>
          <form action={regenerate} onSubmit={(e) => { if (t.edited && !confirm("Regenerating replaces your edits with a fresh version from your master CV. Carry on?")) e.preventDefault(); }}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton className={secondaryButtonClass} pending="Regenerating…">Regenerate</SubmitButton>
          </form>
          <FormMessage state={regen ?? saved} />
        </div>
      </div>
    );
  }

  return (
    <form action={save} className="space-y-4 text-sm">
      <input type="hidden" name="id" value={id} />
      <label className="block space-y-1.5"><span className="font-medium">Summary</span>
        <textarea name="summary" defaultValue={t.summary} rows={4} className="input" />
      </label>
      {t.roles.map((r) => (
        <label key={r.id} className="block space-y-1.5">
          <span className="font-medium">{r.title}, {r.employer}</span>
          <span className="block text-xs text-muted">One line per bullet. Delete any line that oversells.</span>
          <textarea name={`role:${r.id}`} defaultValue={r.bullets.map((b) => b.text).join("\n")} rows={Math.min(12, r.bullets.length + 2)} className="input" />
        </label>
      ))}
      <label className="block space-y-1.5"><span className="font-medium">Skills</span>
        <input name="skills" defaultValue={t.skills.join(", ")} className="input" />
        <span className="block text-xs text-muted">Separate with commas.</span>
      </label>
      {t.coverLetter != null && (
        <label className="block space-y-1.5"><span className="font-medium">Cover letter</span>
          <textarea name="coverLetter" defaultValue={t.coverLetter} rows={14} className="input" />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>Save changes</SubmitButton>
        <button type="button" className={secondaryButtonClass} onClick={() => setEditing(false)}>Cancel</button>
        <FormMessage state={saved?.ok ? null : saved} />
      </div>
    </form>
  );
}
