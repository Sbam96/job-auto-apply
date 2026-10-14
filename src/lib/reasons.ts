// TR-05: says in plain words why an application is waiting for the user. Pure.
import { AUTO_SUBMIT_THRESHOLD, SIMPLE_ATS, type Status } from "./config";

export interface WaitingApp {
  status: Status;
  score: number;
  ats: string | null;
  url: string;
  flags: string[];
  unresolved: { label: string; reason: string }[];
}

const host = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "the employer's site"; } };

// `short` is one line for lists; `details` are the full reasons for the application page.
export function waitingReason(app: WaitingApp, autoThreshold = AUTO_SUBMIT_THRESHOLD): { short: string; details: string[] } {
  if (app.status === "needs_action") {
    const items = app.unresolved ?? [];
    if (!items.length) return { short: "The worker stopped before submitting.", details: ["The worker stopped before submitting. Open the job and apply yourself, or queue it again."] };
    const details = items.map((u) => `${u.label}: ${u.reason}`);
    const first = items[0];
    const short = items.length === 1 ? `Stopped at "${first.label}": ${first.reason}.` : `Stopped at ${items.length} things, starting with "${first.label}" (${first.reason}).`;
    return { short, details };
  }
  if (app.status !== "needs_approval") return { short: "", details: [] };

  const details: string[] = [];
  if (app.flags.some((f) => /prompt injection/i.test(f))) details.push("The job text contained something that looked like instructions aimed at the AI. It was removed, but a person should check this one.");
  if (app.score < autoThreshold) details.push(`It scored ${app.score}. Only matches at ${autoThreshold} or above go in without asking you (you can change this in Job preferences).`);
  const simple = !!app.ats && (SIMPLE_ATS as readonly string[]).includes(app.ats);
  if (!simple) details.push(`The application is on ${host(app.url)}, not a Greenhouse, Lever or Ashby form, so the worker fills what it can and you press submit.`);
  if (!details.length) details.push("You took it out of the queue, so it waits for your OK.");
  const short = !simple && app.score < autoThreshold ? `Scored ${app.score} (auto-submit is ${autoThreshold}+) and the form is on ${host(app.url)}.`
    : app.score < autoThreshold ? `Scored ${app.score}; auto-submit starts at ${autoThreshold}.`
    : !simple ? `Strong match, but the form is on ${host(app.url)}, which needs you to press submit.`
    : details[0];
  return { short, details };
}

// Queued applications the worker can't submit on its own: it fills them in review mode and you press submit.
export function needsReviewMode(app: Pick<WaitingApp, "status" | "ats">) {
  return app.status === "queued" && !(app.ats && (SIMPLE_ATS as readonly string[]).includes(app.ats));
}

export function workerLine(seenAt: Date | null, now: Date): string {
  if (!seenAt) return "Your laptop worker hasn't connected yet.";
  const mins = Math.round((now.getTime() - seenAt.getTime()) / 60000);
  const when = mins < 2 ? "just now" : mins < 60 ? `${mins} minutes ago` : mins < 60 * 24 ? `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? "" : "s"} ago` : `on ${seenAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  return `Your laptop worker last checked in ${when}.`;
}
