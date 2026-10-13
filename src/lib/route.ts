// Where a matched job goes: auto-submit, the approval queue, or the user (AP-01 to AP-03).
// Pure.

import { AUTO_SUBMIT_THRESHOLD, SIMPLE_ATS } from "./config";
import type { Job } from "./types";

export type Route = "auto" | "approval";

// Works out which ATS an apply link belongs to, for jobs found on aggregators.
export function atsFromUrl(url: string): Job["ats"] {
  const u = String(url ?? "").toLowerCase();
  if (/greenhouse\.io/.test(u)) return "greenhouse";
  if (/jobs\.(eu\.)?lever\.co/.test(u)) return "lever";
  if (/ashbyhq\.com/.test(u)) return "ashby";
  return null;
}

export function routeFor(input: { score: number; ats: Job["ats"]; flagged: boolean; autoThreshold?: number }): Route {
  const threshold = input.autoThreshold ?? AUTO_SUBMIT_THRESHOLD;
  if (input.flagged) return "approval"; // TL-04: a suspicious job always gets a human look
  if (input.score >= threshold && input.ats && (SIMPLE_ATS as readonly string[]).includes(input.ats)) return "auto"; // AP-01
  return "approval"; // AP-02
}
