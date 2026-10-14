import { notFound } from "next/navigation";
import { setStatusAction } from "@/app/actions";
import { STATUS_LABELS } from "@/lib/config";
import { formatMonth } from "@/lib/cv";
import { getDb } from "@/lib/db";
import { llmFromEnv } from "@/lib/llm";
import { freshTailored } from "@/lib/refresh";
import { requireUser } from "@/lib/session";
import { events, getApplication, getProfile, submissions } from "@/lib/store";
import { nextStatuses } from "@/lib/status";
import { waitingReason } from "@/lib/reasons";
import { answerAuthQuestion, immigrationText } from "@/lib/workauth";
import { Card, PageHeader, Score, StatusBadge, buttonClass, secondaryButtonClass } from "@/components/ui";
import { CopyButton } from "./CopyButton";

const AUTH_Q = "Are you legally authorised to work in the country where this job is located?";
const SPONSOR_Q = "Will you now or in the future require visa sponsorship?";

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const app = await getApplication(db, user.id, id);
  if (!app) notFound();
  const [profile, history, sent] = await Promise.all([getProfile(db, user.id), events(db, user.id, id), submissions(db, user.id, id)]);
  const place = { region: app.region as "US", mode: app.mode as "remote", countries: app.countries };
  // TL-06: show (and submit) the version tailored from the latest master CV.
  const t = await freshTailored(db, user.id, app, profile, llmFromEnv());
  const moves = nextStatuses(app.status);
  const waiting = app.status === "needs_approval" || app.status === "needs_action";

  return (
    <>
      <PageHeader
        title={app.title}
        intro={`${app.company}, ${app.location}`}
        action={<div className="flex items-center gap-3"><Score value={app.score} /><StatusBadge status={app.status} /></div>}
      />

      {waiting && (
        <Card title={app.status === "needs_action" ? "This needs your input" : "Approve this application?"} className="mb-6 border-warn/40">
          <p className="mb-2 text-sm font-medium">{app.status === "needs_action" ? "Why the worker stopped:" : "Why this wasn't sent automatically:"}</p>
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm" data-reasons>{waitingReason(app, profile.thresholds?.auto).details.map((d) => <li key={d}>{d}</li>)}</ul>
          <p className="mb-4 text-sm text-muted">
            Check the CV and answers below. Approving queues it for your laptop worker to submit. If you&apos;d rather apply yourself, open the job, apply, then mark it applied.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="queued" /><button className={buttonClass}>Approve and queue</button></form>
            <a href={app.url} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>Open the job ↗</a>
            <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="applied" /><button className={secondaryButtonClass}>I applied myself</button></form>
            <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="skipped" /><button className={secondaryButtonClass}>Skip this one</button></form>
          </div>
        </Card>
      )}

      {app.status === "queued" && (
        <Card title="Queued to submit" className="mb-6">
          <p className="mb-4 text-sm text-muted">
            Your laptop worker will submit this the next time it runs. Changed your mind? Cancel it, or send it back for your approval so it waits until you say go.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="skipped" /><input type="hidden" name="note" value="Cancelled before it was submitted" /><button className={secondaryButtonClass}>Cancel this application</button></form>
            <form action={setStatusAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="needs_approval" /><input type="hidden" name="note" value="Taken out of the queue" /><button className={secondaryButtonClass}>Back to my approval</button></form>
          </div>
        </Card>
      )}

      {app.flags.length > 0 && (
        <Card title="Notes" className="mb-6">
          <ul className="list-disc space-y-1 pl-5 text-sm text-warn">{app.flags.map((f, i) => <li key={i}>{f}</li>)}</ul>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Tailored CV" aside={<span className="text-xs text-muted">{t.usedLLM ? "Reworded by AI, checked against your CV" : "Your own wording, reordered"}</span>}>
            <div className="space-y-4 text-sm">
              {t.summary && <p>{t.summary}</p>}
              {t.roles.map((r) => (
                <div key={r.id}>
                  <p className="font-medium">{r.title}, {r.employer}</p>
                  {r.team && <p className="text-sm">{r.team}</p>}
                  <p className="text-xs text-muted">{formatMonth(r.start)} to {formatMonth(r.end)}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">{r.bullets.map((b) => <li key={b.sourceId}>{b.text}</li>)}</ul>
                </div>
              ))}
              {t.skills.length > 0 && <p><span className="font-medium">Skills: </span>{t.skills.join(", ")}</p>}
            </div>
          </Card>

          {t.coverLetter && (
            <Card title="Cover letter" aside={<CopyButton text={t.coverLetter} />}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{t.coverLetter}</p>
            </Card>
          )}

          <Card title="Job description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{app.description.slice(0, 6000)}</p>
            {app.attribution && <p className="mt-3 text-xs text-muted">{app.attribution}</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Why it matched">
            <dl className="space-y-2 text-sm">
              {([["Title", app.breakdown.title, 30], ["Skills", app.breakdown.skills, 45], ["Experience", app.breakdown.experience, 15], ["Domain", app.breakdown.domain, 10]] as const).map(([k, v, max]) => (
                <div key={k} className="flex justify-between"><dt className="text-muted">{k}</dt><dd className="tabular-nums">{v} / {max}</dd></div>
              ))}
            </dl>
            {app.breakdown.matchedSkills.length > 0 && <p className="mt-3 text-xs text-muted"><span className="font-medium text-ink">Matched:</span> {app.breakdown.matchedSkills.join(", ")}</p>}
            {app.breakdown.missingSkills.length > 0 && <p className="mt-1 text-xs text-muted"><span className="font-medium text-ink">Not on your CV:</span> {app.breakdown.missingSkills.join(", ")}</p>}
          </Card>

          <Card title="Answers it will give">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-muted">Authorised to work there?</dt><dd className="font-medium">{answerAuthQuestion(AUTH_Q, place, profile.auth)}</dd></div>
              <div><dt className="text-muted">Need sponsorship?</dt><dd className="font-medium">{answerAuthQuestion(SPONSOR_Q, place, profile.auth)}</dd></div>
              <div><dt className="text-muted">Self-ID questions</dt><dd className="font-medium">{Object.values(profile.selfId).every((v) => v === "prefer_not") ? "Prefer not to say" : "As set in your details"}</dd></div>
              {immigrationText(place) && <div><dt className="text-muted">Context box</dt><dd>{immigrationText(place)}</dd></div>}
            </dl>
          </Card>

          {moves.length > 0 && !waiting && app.status !== "queued" && (
            <Card title="Update status">
              <form action={setStatusAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <select name="status" className="input" defaultValue={moves[0]} aria-label="New status">
                  {moves.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <input name="note" className="input" placeholder="Note (optional)" maxLength={500} />
                <button className={`${buttonClass} w-full`}>Update</button>
              </form>
            </Card>
          )}

          <Card title="History">
            <ol className="space-y-2 text-xs text-muted">
              {history.map((e, i) => {
                const d = e.detail as { from?: string; to?: string; note?: string } | null;
                return <li key={i}><span className="block text-ink">{e.created_at.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>{e.kind === "status" ? `${d?.from} → ${d?.to}${d?.note ? `: ${d.note}` : ""}` : e.kind.replace("_", " ")}</li>;
              })}
              {sent.map((s, i) => <li key={`s${i}`}><span className="block text-ink">{new Date(s.sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>submitted to {s.target_url}</li>)}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
