// Answers application-form questions from stored data (EX-03, PR-04, PR-05, WA-01 to WA-05).
// Plain code: these answers never go through the LLM. The browser extension sends the form's
// questions here and fills in what comes back; anything unresolved is left for you.

import type { Profile } from "./types";
import { answerAuthQuestion, immigrationText, type JobPlace } from "./workauth";

export interface FormQuestion {
  label: string;
  type: "text" | "textarea" | "select" | "radio" | "checkbox" | "file" | "email" | "tel" | "url";
  required: boolean;
  options?: string[];
  maxLength?: number;
}

export interface FormPlan {
  answers: { label: string; value: string; kind: "file-cv" | "file-cover" | "text" | "choice" }[];
  unresolved: { label: string; reason: string }[];
  captcha: boolean;
}

const has = (s: string, re: RegExp) => re.test(s);
const DECLINE = /(prefer not|decline|don.?t wish|do not wish|choose not|not to (say|answer|disclose|self)|don.?t want|do not want|rather not)/i;

// PR-05: pick the "prefer not to say" option, whatever the form calls it.
function declineOption(options: string[] = []) {
  return options.find((o) => DECLINE.test(o)) ?? null;
}

function pickOption(options: string[] | undefined, want: string): string | null {
  if (!options?.length) return want;
  const w = want.toLowerCase();
  return options.find((o) => o.toLowerCase() === w) ?? options.find((o) => o.toLowerCase().startsWith(w)) ?? null;
}

function salaryFor(job: JobPlace, p: Profile): string | null {
  const usd = p.expectedSalary.usd;
  const gbp = p.expectedSalary.gbp;
  if ((job.region === "US" || job.region === "CA") && usd) return `${usd.toLocaleString("en-US")} USD`;
  if (gbp) return `£${gbp.toLocaleString("en-GB")}`;
  if (usd) return `${usd.toLocaleString("en-US")} USD`;
  return null;
}

export function planForm(questions: FormQuestion[], profile: Profile, job: JobPlace, opts: { coverLetter?: string | null; captcha?: boolean } = {}): FormPlan {
  const answers: FormPlan["answers"] = [];
  const unresolved: FormPlan["unresolved"] = [];
  const [first, ...rest] = profile.fullName.trim().split(/\s+/);
  const last = rest.join(" ");

  for (const q of questions) {
    const l = q.label.toLowerCase();
    const put = (value: string | null, kind: FormPlan["answers"][number]["kind"] = "text") => {
      if (value) answers.push({ label: q.label, value, kind });
      else if (q.required) unresolved.push({ label: q.label, reason: "no stored answer" });
    };

    if (q.type === "file") {
      if (has(l, /cover/)) {
        if (opts.coverLetter) put("cover-letter", "file-cover");
        else if (q.required) unresolved.push({ label: q.label, reason: "cover letter required but not written" });
      } else if (has(l, /resume|cv|curriculum/)) put("cv", "file-cv");
      else if (q.required) unresolved.push({ label: q.label, reason: "unexpected file upload" });
      continue;
    }

    // Self-ID (PR-05): always the decline option; never guessed.
    if (has(l, /veteran|disabilit|gender|race|ethnic|hispanic|latino|sexual orientation|pronoun|transgender/)) {
      const key = has(l, /veteran/) ? "veteran" : has(l, /disabilit/) ? "disability" : has(l, /gender|pronoun|transgender|sexual/) ? "gender" : "race";
      const stored = profile.selfId[key as keyof Profile["selfId"]];
      const value = stored && stored !== "prefer_not" ? pickOption(q.options, stored) : declineOption(q.options) ?? (q.options?.length ? null : "Prefer not to say");
      if (value) answers.push({ label: q.label, value, kind: "choice" });
      else unresolved.push({ label: q.label, reason: "no decline option offered" });
      continue;
    }

    // Work authorisation (WA-01 to WA-04).
    const auth = answerAuthQuestion(q.label, job, profile.auth);
    if (auth) { put(pickOption(q.options, auth), "choice"); continue; }

    if (has(l, /first name|given name/)) { put(first || null); continue; }
    if (has(l, /last name|surname|family name/)) { put(last || null); continue; }
    if (has(l, /^name$|full name|your name|^name\b/)) { put(profile.fullName || null); continue; }
    if (has(l, /e-?mail/)) { put(profile.contactEmail || null); continue; }
    if (has(l, /phone|mobile|telephone/)) { put(profile.phone || null); continue; }
    if (has(l, /linkedin/)) { put(profile.linkedin || null); continue; }
    if (has(l, /portfolio|website|personal site|github|other link/)) { put(profile.portfolio || profile.linkedin || null); continue; }
    if (has(l, /current location|where are you (based|located)|\bcity\b|^location$|location \(city\)/)) { put(profile.homeCity || null); continue; }
    if (has(l, /salary|compensation|pay expectation|desired pay/)) { put(salaryFor(job, profile)); continue; }
    if (has(l, /notice period|start date|when can you start|availability to start/)) { put(profile.noticePeriod || null); continue; }
    if (has(l, /time ?zone|working hours|overlap|\b(est|pst|cst|et|pt)\b|eastern time|pacific time/)) { put(profile.usHoursOverlap || null); continue; }
    if (has(l, /how did you hear|where did you (hear|find)|source/)) { put(pickOption(q.options, "Job board") ?? q.options?.[0] ?? "Job board", "choice"); continue; }
    if (has(l, /privacy|consent|i agree|acknowledge|terms/) && (q.type === "checkbox" || q.type === "radio" || q.type === "select")) {
      put(pickOption(q.options, "Yes") ?? q.options?.[0] ?? "Yes", "choice");
      continue;
    }
    // WA-05: "anything else?" boxes carry the immigration text, US roles only.
    if (has(l, /additional information|anything else|other information|cover letter|message to the hiring/)) {
      if (has(l, /cover letter/) && opts.coverLetter) { put(opts.coverLetter); continue; }
      const text = immigrationText(job, q.maxLength);
      if (text) put(text);
      else if (q.required) unresolved.push({ label: q.label, reason: "free-text box" });
      continue;
    }
    // Anything else: essay boxes and unknown questions go to the user (AP-03).
    if (q.required) unresolved.push({ label: q.label, reason: q.type === "textarea" ? "essay question" : "unknown question" });
  }
  return { answers, unresolved, captcha: !!opts.captcha };
}

