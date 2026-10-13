// The midnight report (TR-02) and the "needs your action" email (TR-03). Pure: builds text only.

import { STATUS_LABELS, type Status } from "./config";

export interface AppSummary {
  id: number;
  company: string;
  title: string;
  region: string;
  score: number;
  status: Status;
  createdAt: Date;
  appliedAt: Date | null;
  note?: string | null;
}

const sameDay = (a: Date, b: Date, tz = "Europe/London") =>
  a.toLocaleDateString("en-GB", { timeZone: tz }) === b.toLocaleDateString("en-GB", { timeZone: tz });

export function buildReport(apps: AppSummary[], now: Date, appUrl: string) {
  // The report runs just after midnight, so "today" means the day that just ended.
  const day = new Date(now.getTime() - 60 * 60 * 1000);
  const applied = apps.filter((a) => a.appliedAt && sameDay(a.appliedAt, day));
  const pending = apps.filter((a) => a.status === "needs_approval");
  const unresolved = apps.filter((a) => a.status === "needs_action");
  const fresh = apps.filter((a) => sameDay(a.createdAt, day) && a.status !== "skipped");
  const line = (a: AppSummary) => `- ${a.title} at ${a.company} (${a.region}, score ${a.score})${a.note ? `: ${a.note}` : ""}\n  ${appUrl}/applications/${a.id}`;
  const section = (title: string, list: AppSummary[], empty: string) => `${title} (${list.length})\n${list.length ? list.map(line).join("\n") : empty}`;
  const date = day.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });
  const text = [
    `Your job applications for ${date}`,
    "",
    section("Applied", applied, "None today."),
    "",
    section("Waiting for your approval", pending, "Nothing waiting."),
    "",
    section("Needs your input", unresolved, "Nothing unresolved."),
    "",
    section("New matches", fresh, "No new matches."),
    "",
    `Open the app: ${appUrl}`,
  ].join("\n");
  const subject = `${applied.length} applied, ${pending.length + unresolved.length} waiting for you`;
  return { subject, text, counts: { applied: applied.length, pending: pending.length, unresolved: unresolved.length, fresh: fresh.length } };
}

export function actionEmail(app: AppSummary, problems: string[], appUrl: string) {
  return {
    subject: `Action needed: ${app.title} at ${app.company}`,
    text: [
      `The application for ${app.title} at ${app.company} needs you before it can go in.`,
      "",
      ...problems.map((p) => `- ${p}`),
      "",
      `Resolve it here: ${appUrl}/applications/${app.id}`,
      `Current status: ${STATUS_LABELS[app.status]}`,
    ].join("\n"),
  };
}
