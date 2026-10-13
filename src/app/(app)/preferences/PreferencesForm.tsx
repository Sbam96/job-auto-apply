"use client";
import { useActionState, useState } from "react";
import { savePreferencesAction, type FormState } from "@/app/actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { Card, Field } from "@/components/ui";
import { EMPLOYMENT_TYPES, MAX_LOCATIONS, REGIONS, SENIORITY, WORK_MODES, type Region } from "@/lib/config";
import type { Profile, UserLocation } from "@/lib/types";

const REGION_NAMES: Record<Region, string> = { US: "United States", CA: "Canada", UK: "United Kingdom", EMEA: "Europe, Middle East & Africa" };
const TYPE_NAMES: Record<string, string> = { permanent: "Permanent, full-time", "fixed-term": "Fixed-term", contract: "Contract / freelance", "part-time": "Part-time", internship: "Internship" };

export function PreferencesForm({ profile: p }: { profile: Profile }) {
  const [state, action] = useActionState<FormState, FormData>(savePreferencesAction, null);
  const [locations, setLocations] = useState<UserLocation[]>(p.locations);
  const update = (i: number, next: Partial<UserLocation>) => setLocations((ls) => ls.map((l, j) => (j === i ? { ...l, ...next } : l)));
  const unused = REGIONS.filter((r) => !locations.some((l) => l.region === r));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="locations" value={JSON.stringify(locations)} />
      <Card title="Roles">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Target job titles" hint="One per line. Similar titles are matched too (e.g. Business Systems Analyst)." htmlFor="targetTitles">
            <textarea id="targetTitles" name="targetTitles" rows={4} defaultValue={p.targetTitles.join("\n")} className="input" />
          </Field>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Lowest level" htmlFor="seniority">
                <select id="seniority" name="seniority" defaultValue={p.seniority} className="input">
                  {SENIORITY.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Highest level" htmlFor="seniorityMax">
                <select id="seniorityMax" name="seniorityMax" defaultValue={p.seniorityMax} className="input">
                  {SENIORITY.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Apply to roles asking for up to (years)" hint="Roles asking for more years than your CV shows still match, up to this limit." htmlFor="maxYearsAsked">
              <input id="maxYearsAsked" name="maxYearsAsked" type="number" min={0} max={30} defaultValue={p.maxYearsAsked} className="input sm:w-32" />
            </Field>
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium">Employment types</legend>
              <div className="space-y-1">
                {EMPLOYMENT_TYPES.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm"><input type="checkbox" name="employmentTypes" value={t} defaultChecked={p.employmentTypes.includes(t)} /> {TYPE_NAMES[t]}</label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
      </Card>

      <Card title="Pay floor" >
        <p className="mb-4 text-sm text-muted">Jobs that list pay below this are skipped. Jobs that don&apos;t list pay are kept.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Minimum (USD a year)" htmlFor="floorUsd"><input id="floorUsd" name="floorUsd" inputMode="numeric" defaultValue={p.salaryFloor.usd ?? ""} placeholder="90000" className="input" /></Field>
          <Field label="Minimum (GBP a year)" htmlFor="floorGbp"><input id="floorGbp" name="floorGbp" inputMode="numeric" defaultValue={p.salaryFloor.gbp ?? ""} placeholder="50000" className="input" /></Field>
        </div>
      </Card>

      <Card title="Locations" aside={<span className="text-xs text-muted">{locations.length} of {MAX_LOCATIONS}</span>}>
        <div className="space-y-4">
          {locations.map((l, i) => (
            <div key={l.region} className="rounded-lg border border-line p-4" data-location={l.region}>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-medium">{REGION_NAMES[l.region]}</p>
                <button type="button" className="text-xs text-muted hover:text-bad" onClick={() => setLocations((ls) => ls.filter((_, j) => j !== i))}>Remove</button>
              </div>
              <div className="flex flex-wrap gap-4">
                {WORK_MODES.map((m) => (
                  <label key={m} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={l.modes.includes(m)} onChange={(e) => update(i, { modes: e.target.checked ? [...l.modes, m] : l.modes.filter((x) => x !== m) })} />
                    {m === "onsite" ? "On-site" : m[0].toUpperCase() + m.slice(1)}
                  </label>
                ))}
              </div>
              <div className="mt-3">
                <Field label="Cities (for hybrid and on-site)" hint="Comma separated, e.g. NYC, London. Leave empty for anywhere in the region." htmlFor={`cities-${l.region}`}>
                  <input id={`cities-${l.region}`} className="input" defaultValue={l.cities.join(", ")} onChange={(e) => update(i, { cities: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} />
                </Field>
              </div>
            </div>
          ))}
          {unused.length > 0 && locations.length < MAX_LOCATIONS && (
            <div className="flex flex-wrap gap-2">
              {unused.map((r) => <button key={r} type="button" className="rounded-full border border-line px-3 py-1 text-sm hover:bg-canvas" onClick={() => setLocations((ls) => [...ls, { region: r, modes: ["remote"], cities: [] }])}>+ {REGION_NAMES[r]}</button>)}
            </div>
          )}
        </div>
      </Card>

      <Card title="Work authorisation">
        <Field label="On US forms, will you need sponsorship now or in the future?" hint="Your current answer is Yes. Confirm with an immigration adviser before changing it; on a family-based route the honest answer may be No." htmlFor="usSponsorship">
          <select id="usSponsorship" name="usSponsorship" defaultValue={p.auth.usSponsorship ? "yes" : "no"} className="input sm:w-48">
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </Field>
      </Card>

      <Card title="Automation">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Apply from score" hint="Matches under this are skipped (default 75)." htmlFor="applyThreshold"><input id="applyThreshold" name="applyThreshold" type="number" min={50} max={100} defaultValue={p.thresholds.apply} className="input" /></Field>
          <Field label="Auto-submit from score" hint="At or above this, simple forms go in without asking (default 85)." htmlFor="autoThreshold"><input id="autoThreshold" name="autoThreshold" type="number" min={50} max={100} defaultValue={p.thresholds.auto} className="input" /></Field>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" name="paused" defaultChecked={p.paused} /> Pause searching</label>
      </Card>

      <div className="flex items-center gap-4"><SubmitButton>Save preferences</SubmitButton><FormMessage state={state} /></div>
    </form>
  );
}
