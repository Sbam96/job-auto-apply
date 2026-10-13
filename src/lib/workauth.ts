// Work authorisation answers (WA-01 to WA-05). Always truthful, always decided here by plain code,
// never by the LLM. The immigration text is fixed: the app chooses short or long, never rewords it.

import type { Region, WorkMode } from "./config";
import { countryIn } from "./location";

export const IMMIGRATION_TEXT = Object.freeze({
  short: "I'm not yet authorised to work in the US. I won't need ongoing sponsorship: shortly after relocating I'll be eligible for permanent residence with work authorisation.",
  long: "I'm not currently authorised to work in the US and would need support initially. However, I won't require long-term sponsorship: shortly after relocating I'll be eligible to apply for permanent residence, including work authorisation. In the meantime, I can start immediately from the UK as a contractor or via an employer-of-record.",
});

export interface AuthSettings { usSponsorship: boolean; canadaSponsorship: boolean }
export const DEFAULT_AUTH: AuthSettings = Object.freeze({ usSponsorship: true, canadaSponsorship: true });

export interface JobPlace { region: Region; mode: WorkMode; countries?: readonly string[] }

// Which country's rules apply. A remote role open to the UK is done from the UK.
export function workCountry(job: JobPlace): string {
  if (job.region === "US") return "us";
  if (job.region === "CA") return "canada";
  if (job.region === "UK") return "uk";
  if (job.mode === "remote") return "uk";
  return job.countries?.find((c) => c !== "uk") ?? "eu";
}

export const isAuthorised = (country: string) => country === "uk";

function needsSponsorship(country: string, s: AuthSettings) {
  if (country === "uk") return false;
  if (country === "us") return s.usSponsorship !== false;
  if (country === "canada") return s.canadaSponsorship !== false;
  return true; // an EU country, on-site
}

const AUTH_Q = /(authori[sz]ed|eligible|legally|right) to work|work authori[sz]ation|work permit|right to work/i;
const SPONSOR_Q = /sponsor|visa|immigration (support|status)/i;

// Answers a yes/no authorisation question for a job. Returns null when it isn't one.
export function answerAuthQuestion(question: string, job: JobPlace, settings: AuthSettings = DEFAULT_AUTH): "Yes" | "No" | null {
  const q = String(question ?? "");
  const named = countryIn(q);
  const country = named ?? workCountry(job);
  if (SPONSOR_Q.test(q)) {
    // WA-04: a remote EMEA role is done from the UK, so no visa is needed,
    // unless the question names a country the user would need one for.
    if (!named && job.mode === "remote" && (job.region === "UK" || job.region === "EMEA")) return "No";
    return needsSponsorship(country, settings) ? "Yes" : "No";
  }
  if (AUTH_Q.test(q)) return isAuthorised(country) ? "Yes" : "No";
  return null;
}

// WA-05: immigration context only on US roles. The long text if it fits the box, else the short one.
export function immigrationText(job: JobPlace, maxLength = Infinity): string | null {
  if (job.region !== "US") return null;
  if (IMMIGRATION_TEXT.long.length <= maxLength) return IMMIGRATION_TEXT.long;
  if (IMMIGRATION_TEXT.short.length <= maxLength) return IMMIGRATION_TEXT.short;
  return null; // too small for either: left for the user (AP-03)
}

// AP-04: a cover letter only where required, or where the user lacks authorisation.
export function wantsCoverLetter(job: JobPlace, { required = false } = {}) {
  return required || !isAuthorised(workCountry(job));
}
