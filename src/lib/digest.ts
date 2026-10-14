// NT-01: the digest email, every day or every two days at the hour you choose (UK time).
// Pure: decides whether one is due and builds the text.
import { MATCH_EXPIRY_DAYS, STATUS_LABELS, type Status } from "./config";

export interface DigestApp { id: number; company: string; title: string; region: string; score: number; status: Status; createdAt: Date; updatedAt: Date; hasCoverLetter: boolean }

const HOUR = 3600000;

export const londonHour = (now: Date) => Number(now.toLocaleString("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false })) % 24;

// Due in the chosen hour, once every `every` days. A couple of hours' slack stops a slow
// scheduled run from pushing the next digest a whole day later.
export function digestDue(settings: { every: 1 | 2; hour: number }, last: Date | null, now: Date) {
  if (londonHour(now) !== settings.hour) return false;
  return !last || now.getTime() - last.getTime() >= settings.every * 24 * HOUR - 2 * HOUR;
}

export function buildDigest(apps: DigestApp[], since: Date | null, now: Date, appUrl: string) {
  const waiting = apps.filter((a) => a.status === "new");
  const fresh = waiting.filter((a) => !since || a.createdAt > since);
  const older = waiting.filter((a) => !fresh.includes(a));
  const expiring = older.filter((a) => now.getTime() - a.updatedAt.getTime() > (MATCH_EXPIRY_DAYS - 5) * 24 * HOUR);
  if (!fresh.length && !waiting.length) return null; // nothing to tell you

  const docs = (a: DigestApp) => (a.hasCoverLetter ? "CV and cover letter ready" : "CV ready");
  const line = (a: DigestApp) => `- ${a.title} at ${a.company} (${a.region}, score ${a.score}): ${docs(a)}\n  ${appUrl}/applications/${a.id}`;
  const progress = (["applied", "response", "interview", "offer"] as Status[])
    .map((s) => [s, apps.filter((a) => a.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${STATUS_LABELS[s]}: ${n}`).join(", ");

  const text = [
    fresh.length ? `New matches (${fresh.length})` : "No new matches since your last email.",
    ...fresh.map(line),
    "",
    ...(older.length ? [`Still ready for you (${older.length})`, ...older.map(line), ""] : []),
    ...(expiring.length ? [`${expiring.length} of these expire within 5 days if you don't act on them.`, ""] : []),
    ...(progress ? [`Your applications so far: ${progress}.`, ""] : []),
    "Download the documents in the app, apply on the employer's site, then press \"I've applied\".",
    `Open the app: ${appUrl}`,
  ].join("\n");
  const subject = fresh.length
    ? `${fresh.length} new match${fresh.length === 1 ? "" : "es"} with documents ready`
    : `${waiting.length} match${waiting.length === 1 ? "" : "es"} still ready for you`;
  return { subject, text, counts: { fresh: fresh.length, waiting: waiting.length, expiring: expiring.length } };
}
