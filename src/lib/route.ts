// Which applicant tracking system a job link belongs to, for jobs found on aggregators. Pure.
import type { Job } from "./types";

export function atsFromUrl(url: string): Job["ats"] {
  const u = String(url ?? "").toLowerCase();
  if (/greenhouse\.io/.test(u)) return "greenhouse";
  if (/jobs\.(eu\.)?lever\.co/.test(u)) return "lever";
  if (/ashbyhq\.com/.test(u)) return "ashby";
  return null;
}
