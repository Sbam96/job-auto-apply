// The last search, explained: how many jobs were checked and why the rest didn't make it.
import type { UserRunSummary } from "@/lib/pipeline";
import { REJECT_LABELS } from "@/lib/labels";



export function LastSearch({ run, everyHours, paused }: { run: UserRunSummary | null; everyHours: number; paused: boolean }) {
  if (!run) return null;
  // SC-01: when the next scheduled search should run (the scheduler checks on the hour).
  const next = new Date(new Date(run.at).getTime() + everyHours * 3600000);
  const nextText = paused ? "Searching is paused." : `Next search around ${next.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" })}.`;
  const reasons = Object.entries(run.rejected).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const when = new Date(run.at).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <section aria-labelledby="last-search" className="mb-8 rounded-2xl border border-line bg-surface p-5 md:p-6">
      <h2 id="last-search" className="text-lg font-semibold">Last search, {when}</h2>
      <p className="mt-1 text-[0.95rem]">
        Checked <strong>{run.checked}</strong> jobs and matched <strong>{run.matched}</strong>.
        {run.sourceErrors > 0 && <span className="text-muted"> {run.sourceErrors} source{run.sourceErrors === 1 ? "" : "s"} couldn&apos;t be reached.</span>}
        <span className="text-muted" data-next-search> {nextText}</span>
      </p>
      {reasons.length > 0 && (
        <ul className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {reasons.map(([stage, n]) => (
            <li key={stage} className="flex gap-2"><span className="w-10 shrink-0 text-right font-semibold tabular-nums">{n}</span><span className="text-muted">{REJECT_LABELS[stage] ?? stage}</span></li>
          ))}
        </ul>
      )}
    </section>
  );
}
