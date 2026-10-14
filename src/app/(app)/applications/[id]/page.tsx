import { notFound } from "next/navigation";
import { blockCompanyAction, setStatusAction } from "@/app/actions";
import { APPLIED_RETENTION_DAYS, MATCH_EXPIRY_DAYS, STATUS_LABELS } from "@/lib/config";
import { getDb } from "@/lib/db";
import { llmFromEnv } from "@/lib/llm";
import { editedButOutdated, freshTailored } from "@/lib/refresh";
import { requireUser } from "@/lib/session";
import { employerSearchUrl, findDirectLink, isAggregator, sourceName } from "@/lib/direct";
import { events, getApplication, getProfile, saveDirectLink } from "@/lib/store";
import { nextStatuses } from "@/lib/status";
import { answerAuthQuestion, immigrationText } from "@/lib/workauth";
import { Card, PageHeader, Score, StatusBadge, buttonClass, secondaryButtonClass } from "@/components/ui";
import { coverText } from "@/lib/documents";
import { CopyButton } from "./CopyButton";
import { DocEditor } from "./DocEditor";

const AUTH_Q = "Are you legally authorised to work in the country where this job is located?";
const SPONSOR_Q = "Will you now or in the future require visa sponsorship?";
const day = 86400000;
const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const EVENT_LABELS: Record<string, string> = {
  created: "Matched, documents prepared",
  cv_updated: "Documents refreshed from your updated master CV",
  edited: "You edited the documents",
  regenerated: "Documents regenerated",
  downloaded: "Downloaded",
};

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  let app = await getApplication(db, user.id, id);
  if (!app) notFound();
  // SR-08: matches made before direct links existed get looked up the first time they're opened.
  if (isAggregator(app.source) && !app.direct_checked_at) {
    await saveDirectLink(db, app.job_id, await findDirectLink(app));
    app = (await getApplication(db, user.id, id))!;
  }
  const viaBoard = isAggregator(app.source);
  const applyUrl = viaBoard ? app.direct_url : app.url;
  const [profile, history] = await Promise.all([getProfile(db, user.id), events(db, user.id, id)]);
  const place = { region: app.region as "US", mode: app.mode as "remote", countries: app.countries };
  // TL-06: show (and download) the version tailored from the latest master CV.
  const t = await freshTailored(db, user.id, app, profile, llmFromEnv());
  const outdated = editedButOutdated({ status: app.status, tailored: t }, profile);
  const moves = nextStatuses(app.status).filter((s) => !["applied", "dismissed", "new"].includes(s));
  const ready = app.status === "new";
  const archived = !!app.applied_at;
  const dl = (doc: "cv" | "cover", format: "pdf" | "docx") => `/applications/${id}/download?doc=${doc}&format=${format}`;
  const imm = immigrationText(place);

  const answers: [string, string][] = [
    ["Authorised to work there?", answerAuthQuestion(AUTH_Q, place, profile.auth) ?? ""],
    ["Need visa sponsorship?", answerAuthQuestion(SPONSOR_Q, place, profile.auth) ?? ""],
    ...(imm ? [["Extra information / context box", imm] as [string, string]] : []),
    ...(profile.noticePeriod ? [["Notice period", profile.noticePeriod] as [string, string]] : []),
    ...(app.region === "US" && profile.expectedSalary.usd ? [["Expected salary (USD)", `$${profile.expectedSalary.usd.toLocaleString("en-US")}`] as [string, string]] : []),
    ...(app.region !== "US" && profile.expectedSalary.gbp ? [["Expected salary (GBP)", `£${profile.expectedSalary.gbp.toLocaleString("en-GB")}`] as [string, string]] : []),
    ...(app.region === "US" && profile.usHoursOverlap ? [["Working hours overlap", profile.usHoursOverlap] as [string, string]] : []),
    ...(profile.linkedin ? [["LinkedIn", profile.linkedin] as [string, string]] : []),
    ...(profile.portfolio ? [["Portfolio", profile.portfolio] as [string, string]] : []),
    ["Diversity questions", Object.values(profile.selfId).every((v) => v === "prefer_not") ? "Prefer not to say / decline to answer" : "As set in Details & answers"],
  ];

  return (
    <>
      <PageHeader
        title={app.title}
        intro={`${app.company}, ${app.location}`}
        action={<div className="flex items-center gap-3"><Score value={app.score} /><StatusBadge status={app.status} /></div>}
      />

      <Card title={ready ? "Ready to apply" : archived ? "Applied" : STATUS_LABELS[app.status]} className={`mb-6 ${ready ? "border-l-4 border-l-stamp" : ""}`}>
        <ol className="space-y-4 text-sm">
          <li>
            <p className="mb-2 font-medium">{ready ? "1. Download your documents" : "Your documents"}</p>
            <div className="flex flex-wrap gap-2" data-downloads>
              <a href={dl("cv", "pdf")} className={secondaryButtonClass}>CV (PDF)</a>
              <a href={dl("cv", "docx")} className={secondaryButtonClass}>CV (Word)</a>
              {t.coverLetter && <a href={dl("cover", "pdf")} className={secondaryButtonClass}>Cover letter (PDF)</a>}
              {t.coverLetter && <a href={dl("cover", "docx")} className={secondaryButtonClass}>Cover letter (Word)</a>}
              {t.coverLetter && <CopyButton text={coverText(profile, t.coverLetter)} label="Copy cover letter text" className={secondaryButtonClass} />}
            </div>
            {t.coverLetter && <p className="mt-2 text-xs text-muted">For forms with a cover letter box: copy the text and paste it in. It includes the greeting and your sign-off.</p>}
            {!t.coverLetter && ready && <p className="mt-2 text-xs text-muted">No cover letter: you can work here without sponsorship and the job doesn&apos;t ask for one.</p>}
          </li>
          {ready && (
            <>
              <li>
                <p className="mb-2 font-medium">2. Apply on {app.company}&apos;s site</p>
                {applyUrl ? (
                  <a href={applyUrl} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass} data-apply-link>Open the job on {app.company}&apos;s site ↗</a>
                ) : (
                  <a href={employerSearchUrl(app)} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass} data-apply-link>Find it on {app.company}&apos;s site ↗</a>
                )}
                <p className="mt-2 text-xs text-muted">
                  {viaBoard && app.direct_url && <>Direct link found on {app.direct_via}. </>}
                  {viaBoard && !app.direct_url && <>{sourceName(app.source)} didn&apos;t give the employer&apos;s link and we couldn&apos;t find it on their job board, so this searches for it. </>}
                  {viaBoard && <>Listed on <a href={app.url} target="_blank" rel="noopener noreferrer" className="underline">{sourceName(app.source)}</a>{app.source === "himalayas" ? " (applying there needs a free Himalayas account)" : ""}. </>}
                  The answers for the form are further down this page.
                </p>
              </li>
              <li>
                <p className="mb-2 font-medium">3. Tell the app you&apos;ve applied</p>
                <div className="flex flex-wrap gap-2">
                  <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="applied" /><button className={buttonClass}>I&apos;ve applied</button></form>
                  <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="dismissed" /><input type="hidden" name="note" value="Not for me" /><button className={secondaryButtonClass}>Not for me</button></form>
                  <form action={blockCompanyAction}><input type="hidden" name="company" value={app.company} /><button className={secondaryButtonClass}>Block {app.company}</button></form>
                </div>
                <p className="mt-2 text-xs text-muted">Untouched matches expire after {MATCH_EXPIRY_DAYS} days. Blocking a company means you&apos;re never matched with them again (undo it on the Companies page).</p>
              </li>
            </>
          )}
        </ol>
        {archived && (
          <p className="mt-4 text-sm text-muted">
            Applied on {fmt(app.applied_at!)}. These documents and this record are deleted on {fmt(new Date(app.applied_at!.getTime() + APPLIED_RETENTION_DAYS * day))}.
          </p>
        )}
        {(app.status === "dismissed" || app.status === "expired") && (
          <form action={setStatusAction} className="mt-4"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="new" /><button className={secondaryButtonClass}>Bring it back</button></form>
        )}
      </Card>

      {app.flags.length > 0 && (
        <Card title="Notes" className="mb-6">
          <ul className="list-disc space-y-1 pl-5 text-sm text-warn">{app.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t.coverLetter ? "Tailored CV and cover letter" : "Tailored CV"} aside={<span className="text-xs text-muted">{t.edited ? "Edited by you" : t.usedLLM ? "Reworded by AI, checked against your CV" : "Your own wording, reordered"}</span>}>
            {outdated && <p className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Your master CV has changed since you edited this. Regenerate to pick up the changes (this replaces your edits).</p>}
            {ready ? <DocEditor id={id} tailored={t} /> : (
              <div className="space-y-3 text-sm">
                <p className="text-muted">This is the version you applied with; it can&apos;t be changed now.</p>
                {t.summary && <p>{t.summary}</p>}
                {t.roles.map((r) => (
                  <div key={r.id}><p className="font-medium">{r.title}, {r.employer}</p><ul className="mt-1 list-disc space-y-1 pl-5">{r.bullets.map((b, i) => <li key={`${b.sourceId}-${i}`}>{b.text}</li>)}</ul></div>
                ))}
                {t.coverLetter && <p className="whitespace-pre-wrap border-t border-line pt-3 leading-relaxed">{t.coverLetter}</p>}
              </div>
            )}
          </Card>

          <Card title="Job description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{app.description.slice(0, 6000)}</p>
            {app.attribution && <p className="mt-3 text-xs text-muted">{app.attribution}</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Answers for the form">
            <dl className="space-y-3 text-sm">
              {answers.map(([k, v]) => (
                <div key={k}>
                  <dt className="flex items-center justify-between gap-2 text-muted">{k}<CopyButton text={v} /></dt>
                  <dd className="font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card title="Why it matched">
            <dl className="space-y-2 text-sm">
              {([["Title", app.breakdown.title, 30], ["Skills", app.breakdown.skills, 45], ["Experience", app.breakdown.experience, 15], ["Domain", app.breakdown.domain, 10]] as const).map(([k, v, max]) => (
                <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v} / {max}</dd></div>
              ))}
            </dl>
            {app.breakdown.matchedSkills.length > 0 && <p className="mt-3 text-xs text-muted"><span className="font-medium text-ink">Matched:</span> {app.breakdown.matchedSkills.join(", ")}</p>}
            {app.breakdown.missingSkills.length > 0 && <p className="mt-1 text-xs text-muted"><span className="font-medium text-ink">Not on your CV:</span> {app.breakdown.missingSkills.join(", ")}</p>}
          </Card>

          {archived && moves.length > 0 && (
            <Card title="Update progress">
              <form action={setStatusAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <select name="status" className="input" defaultValue={moves[0]} aria-label="New status">
                  {moves.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <input name="note" className="input" placeholder="Note (optional)" maxLength={500} />
                <button className={`${buttonClass} w-full`}>Update</button>
              </form>
              {app.status === "applied" && (
                <form action={setStatusAction} className="mt-3"><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="new" /><input type="hidden" name="note" value="Marked applied by mistake" /><button className="text-xs text-muted underline hover:text-ink">I haven&apos;t actually applied yet</button></form>
              )}
            </Card>
          )}

          <Card title="History">
            <ol className="space-y-2 text-xs text-muted">
              {history.map((e, i) => {
                const d = e.detail as { from?: string; to?: string; note?: string; doc?: string; format?: string } | null;
                const label = e.kind === "status"
                  ? `${STATUS_LABELS[d?.from as keyof typeof STATUS_LABELS] ?? d?.from} → ${STATUS_LABELS[d?.to as keyof typeof STATUS_LABELS] ?? d?.to}${d?.note ? `: ${d.note}` : ""}`
                  : e.kind === "downloaded" ? `Downloaded ${d?.doc === "cover" ? "cover letter" : "CV"} (${d?.format === "docx" ? "Word" : "PDF"})`
                  : EVENT_LABELS[e.kind] ?? e.kind.replace(/_/g, " ");
                return <li key={i}><span className="block text-ink">{e.created_at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>{label}</li>;
              })}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
