// The journey of your applications, drawn as a route with stops. Each stop's number is
// how many applications have reached at least that point.
import type { Status } from "@/lib/config";

type Counts = Partial<Record<Status, number>>;

export function RouteMap({ counts }: { counts: Counts }) {
  const n = (...s: Status[]) => s.reduce((t, k) => t + (counts[k] ?? 0), 0);
  const stops = [
    { label: "Matched", value: n("new", "applied", "response", "interview", "offer", "rejected", "dismissed", "expired") },
    { label: "Applied", value: n("applied", "response", "interview", "offer", "rejected") },
    { label: "Heard back", value: n("response", "interview", "offer", "rejected") },
    { label: "Interview", value: n("interview", "offer") },
    { label: "Offer", value: n("offer") },
  ];
  const reached = stops.filter((s) => s.value > 0).length;
  const pct = Math.max(0, reached - 1) / (stops.length - 1);

  return (
    <section aria-label="Where your applications have got to" className="mb-10 rounded-2xl border border-line bg-surface px-5 pb-6 pt-7 md:px-8">
      <div className="relative">
        {/* The route itself, running behind the stops (wide screens). */}
        <div aria-hidden className="absolute left-[10%] right-[10%] top-[calc(3.5rem-1px)] hidden h-0.5 bg-line md:block">
          <div className="route-line h-full bg-accent" style={{ width: `${pct * 100}%` }} />
        </div>
        <ol className="relative grid grid-cols-3 gap-y-8 md:grid-cols-5">
          {stops.map((s, i) => {
            const on = s.value > 0;
            const last = i === stops.length - 1;
            return (
              <li key={s.label} className="flex flex-col items-center text-center">
                <span className={`font-display text-4xl font-bold tabular-nums leading-none ${on ? (last ? "text-red" : "text-ink") : "text-muted font-semibold"}`}>{s.value}</span>
                <span aria-hidden className={`relative z-10 mt-3 h-4 w-4 rounded-full border-[3px] ${on ? (last ? "border-red bg-red" : "border-accent bg-surface") : "border-line bg-surface"}`} />
                <span className={`mt-2 text-sm ${on ? "font-semibold" : "text-muted"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
