"use client";
import { useActionState, useState, useTransition } from "react";
import { saveCvAction, suggestBulletsAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Card, Field, secondaryButtonClass } from "@/components/ui";
import { bulletsFromText, bulletsToText, orderedRoles } from "@/lib/cv";
import type { Bullet, Profile, Role, Skill } from "@/lib/types";

const uid = () => Math.random().toString(36).slice(2, 10);
const newRole = (): Role => ({ id: uid(), title: "", employer: "", team: "", location: "", start: "", end: null, bullets: [] });

export function CvEditor({ profile, common }: { profile: Profile; common: string[] }) {
  const [state, action] = useActionState<FormState, FormData>(saveCvAction, null);
  const [summary, setSummary] = useState(profile.summary);
  const [roles, setRoles] = useState<Role[]>(orderedRoles(profile.experience));
  const [education, setEducation] = useState(profile.education);
  const [certs, setCerts] = useState(profile.certifications.join("\n"));
  const [skills, setSkills] = useState<Skill[]>(profile.skills);
  const [skillInput, setSkillInput] = useState("");
  const [bankInput, setBankInput] = useState("");
  const [suggesting, startSuggest] = useTransition();
  const [suggestMsg, setSuggestMsg] = useState<Record<string, string>>({});
  // Each role's bullets as typed: one box, one bullet per line.
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(orderedRoles(profile.experience).map((r) => [r.id, bulletsToText(r.bullets)])));

  const setRole = (id: string, patch: Partial<Role>) => setRoles((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // Typing in the box rebuilds the approved bullets; suggestions waiting for review are kept.
  const setDraft = (roleId: string, text: string) => {
    setDrafts((d) => ({ ...d, [roleId]: text }));
    setRoles((rs) => rs.map((r) => r.id !== roleId ? r : { ...r, bullets: [...bulletsFromText(text, r.bullets, uid), ...r.bullets.filter((b) => b.status === "pending")] }));
  };
  const approve = (roleId: string, b: Bullet) => {
    const text = `${(drafts[roleId] ?? "").replace(/\s+$/, "")}${drafts[roleId]?.trim() ? "\n" : ""}${b.text}`;
    setDrafts((d) => ({ ...d, [roleId]: text }));
    setRoles((rs) => rs.map((r) => r.id !== roleId ? r : { ...r, bullets: [...bulletsFromText(text, r.bullets, uid), ...r.bullets.filter((x) => x.status === "pending" && x.id !== b.id)] }));
  };
  const reject = (roleId: string, b: Bullet) => setRoles((rs) => rs.map((r) => r.id !== roleId ? r : { ...r, bullets: r.bullets.filter((x) => x.id !== b.id) }));
  const addSkill = (name: string, bank: boolean) => {
    const n = name.trim();
    if (!n) return;
    setSkills((ss) => {
      const i = ss.findIndex((s) => s.name.toLowerCase() === n.toLowerCase());
      if (i >= 0) return ss.map((s, j) => (j === i ? { ...s, onCv: s.onCv || !bank, ticked: s.ticked || bank } : s));
      return [...ss, { name: n, onCv: !bank, ticked: bank, suggested: false }];
    });
  };
  const onCv = skills.filter((s) => s.onCv);
  const bank = skills.filter((s) => !s.onCv);
  const offered = common.filter((c) => !skills.some((s) => s.name.toLowerCase() === c.toLowerCase()));
  const cv = JSON.stringify({ summary, experience: roles, education, certifications: certs.split("\n").map((c) => c.trim()).filter(Boolean), skills });

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="cv" value={cv} />

      <Card title="Summary">
        <textarea aria-label="Summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} className="input" placeholder="Business Analyst with experience in …" />
      </Card>

      <Card title="Work history" aside={<button type="button" className={secondaryButtonClass} onClick={() => { const r = newRole(); setDrafts((d) => ({ ...d, [r.id]: "" })); setRoles((rs) => [r, ...rs]); }}>+ Add role</button>}>
        <p className="mb-4 text-sm text-muted">Shown newest first. Title, employer and dates are never changed by tailoring.</p>
        <div className="space-y-5">
          {roles.length === 0 && <p className="text-sm text-muted">No roles yet. Add your current role first.</p>}
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg border border-line p-4" data-role={r.id}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Job title" htmlFor={`t-${r.id}`}><input id={`t-${r.id}`} value={r.title} onChange={(e) => setRole(r.id, { title: e.target.value })} className="input" /></Field>
                <Field label="Employer" htmlFor={`e-${r.id}`}><input id={`e-${r.id}`} value={r.employer} onChange={(e) => setRole(r.id, { employer: e.target.value })} className="input" /></Field>
                <div className="sm:col-span-2"><Field label="Project or department (optional)" hint="e.g. Health Modernisation programme, or Claims Operations" htmlFor={`p-${r.id}`}><input id={`p-${r.id}`} value={r.team ?? ""} onChange={(e) => setRole(r.id, { team: e.target.value })} className="input" /></Field></div>
                <Field label="Start" htmlFor={`s-${r.id}`}><input id={`s-${r.id}`} type="month" value={r.start} onChange={(e) => setRole(r.id, { start: e.target.value })} className="input" /></Field>
                <Field label="End" hint="Leave empty if this is your current role." htmlFor={`f-${r.id}`}><input id={`f-${r.id}`} type="month" value={r.end ?? ""} onChange={(e) => setRole(r.id, { end: e.target.value || null })} className="input" /></Field>
              </div>
              <div className="mt-4">
                <Field label="Responsibilities and achievements" hint="One bullet per line. Paste them all at once if you like; a leading dash or • is fine. Add more than any one CV would use: tailoring picks the best for each job." htmlFor={`b-${r.id}`}>
                  <textarea id={`b-${r.id}`} rows={Math.max(5, (drafts[r.id] ?? "").split("\n").length + 1)} value={drafts[r.id] ?? ""} onChange={(e) => setDraft(r.id, e.target.value)} className="input" placeholder={"Wrote user stories and acceptance criteria in Jira for three agile teams\nMapped claims processes and cut handling time"} />
                </Field>
              </div>
              {r.bullets.some((b) => b.status === "pending") && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Suggestions to review</p>
                  <ul className="space-y-2">
                    {r.bullets.filter((b) => b.status === "pending").map((b) => (
                      <li key={b.id} data-bullet-status="pending" className="flex items-start gap-3 rounded-lg border border-dashed border-stamp bg-warn-soft/50 p-3">
                        <textarea aria-label="Suggested bullet" rows={2} value={b.text} onChange={(e) => setRoles((rs) => rs.map((x) => x.id !== r.id ? x : { ...x, bullets: x.bullets.map((y) => (y.id === b.id ? { ...y, text: e.target.value } : y)) }))} className="input" />
                        <div className="flex shrink-0 flex-col gap-1.5 pt-1 text-sm">
                          <button type="button" className="font-semibold text-good" onClick={() => approve(r.id, b)}>Approve</button>
                          <button type="button" className="text-bad" onClick={() => reject(r.id, b)}>Reject</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">Only add one if it&apos;s true for you. Edit it first if the wording&apos;s not quite right.</p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" disabled={suggesting || !r.title} className="text-sm font-medium text-accent disabled:opacity-50"
                  onClick={() => startSuggest(async () => {
                    const res = await suggestBulletsAction({ title: r.title, employer: r.employer, bullets: r.bullets.filter((b) => b.status === "approved").map((b) => b.text) });
                    setSuggestMsg((m) => ({ ...m, [r.id]: res.message }));
                    if (res.bullets.length) setRole(r.id, { bullets: [...r.bullets, ...res.bullets.map((text) => ({ id: uid(), text, status: "pending" as const, source: "app" as const }))] });
                  })}>
                  {suggesting ? "Suggesting…" : "Suggest bullets"}
                </button>
                {suggestMsg[r.id] && <span className="text-xs text-muted">{suggestMsg[r.id]}</span>}
                <button type="button" className="ml-auto text-sm text-muted hover:text-bad" onClick={() => setRoles((rs) => rs.filter((x) => x.id !== r.id))}>Remove role</button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Skills on your CV">
        <div className="mb-3 flex flex-wrap gap-2">
          {onCv.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1 rounded-full border border-line px-3 py-1 text-sm">
              {s.name}<button type="button" aria-label={`Remove ${s.name}`} className="text-muted hover:text-bad" onClick={() => setSkills((ss) => ss.filter((x) => x.name !== s.name))}>×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input aria-label="Add a CV skill" value={skillInput} onChange={(e) => setSkillInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(skillInput, false); setSkillInput(""); } }} className="input" placeholder="e.g. SQL, then Enter" />
          <button type="button" className={secondaryButtonClass} onClick={() => { addSkill(skillInput, false); setSkillInput(""); }}>Add</button>
        </div>
      </Card>

      <Card title="Skills bank">
        <p className="mb-3 text-sm text-muted">Everyday skills and tools you have but that aren&apos;t on your CV. Only ticked ones can appear in applications.</p>
        <ul className="mb-3 grid gap-1 sm:grid-cols-2">
          {bank.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={s.ticked} onChange={(e) => setSkills((ss) => ss.map((x) => (x.name === s.name ? { ...x, ticked: e.target.checked } : x)))} /> {s.name}</label>
              <button type="button" aria-label={`Remove ${s.name}`} className="text-xs text-muted hover:text-bad" onClick={() => setSkills((ss) => ss.filter((x) => x.name !== s.name))}>Remove</button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input aria-label="Add to skills bank" value={bankInput} onChange={(e) => setBankInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSkill(bankInput, true); setBankInput(""); } }} className="input" placeholder="e.g. Miro" />
          <button type="button" className={secondaryButtonClass} onClick={() => { addSkill(bankInput, true); setBankInput(""); }}>Add</button>
        </div>
        {offered.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted">Common BA skills. Click any you genuinely have:</p>
            <div className="flex flex-wrap gap-2">{offered.map((c) => <button key={c} type="button" className="rounded-full border border-dashed border-line px-3 py-1 text-xs hover:border-accent hover:text-accent" onClick={() => addSkill(c, true)}>+ {c}</button>)}</div>
          </div>
        )}
      </Card>

      <Card title="Education and certifications">
        <div className="space-y-3">
          {education.map((e, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
              <input aria-label="Qualification" value={e.qualification} placeholder="BSc Biomedical Science" onChange={(ev) => setEducation((es) => es.map((x, j) => (j === i ? { ...x, qualification: ev.target.value } : x)))} className="input" />
              <input aria-label="Institution" value={e.institution} placeholder="University" onChange={(ev) => setEducation((es) => es.map((x, j) => (j === i ? { ...x, institution: ev.target.value } : x)))} className="input" />
              <input aria-label="Year" value={e.year} placeholder="2018" onChange={(ev) => setEducation((es) => es.map((x, j) => (j === i ? { ...x, year: ev.target.value } : x)))} className="input" />
              <button type="button" className="text-sm text-muted hover:text-bad" onClick={() => setEducation((es) => es.filter((_, j) => j !== i))}>Remove</button>
            </div>
          ))}
          <button type="button" className="text-sm font-medium text-accent" onClick={() => setEducation((es) => [...es, { institution: "", qualification: "", year: "" }])}>+ Add education</button>
          <Field label="Certifications" hint="One per line." htmlFor="certs"><textarea id="certs" rows={3} value={certs} onChange={(e) => setCerts(e.target.value)} className="input" placeholder="AWS Certified Solutions Architect" /></Field>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex items-center gap-4 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur">
        <SubmitButton>Save CV</SubmitButton><FormMessage state={state} />
      </div>
    </form>
  );
}
