// Tunable constants. Each one names the requirement it serves.

export const APPLY_THRESHOLD = 75; // MT-06: jobs scoring under this are skipped
export const MAX_LOCATIONS = 4; // PR-06: US, Canada, UK, EMEA
export const PASSWORD_MIN = 10; // AU-01
export const SESSION_DAYS = 30;
export const VERIFY_TOKEN_HOURS = 48;
export const DAILY_MATCH_CAP = 10; // MT-09: at most 10 new matches a day, each with its own documents

// RT-01 to RT-03: how long things are kept.
export const MATCH_EXPIRY_DAYS = 30; // a match you never act on expires (most listings close by then)
export const REMATCH_AFTER_DAYS = 91; // about 3 months after you apply, the same job can be matched again
export const APPLIED_RETENTION_DAYS = 183; // about 6 months after you apply, the CV, cover letter and record are deleted
export const CLOSED_RETENTION_DAYS = 91; // dismissed and expired matches are deleted after about 3 months

// SR-01: Remotive asks for at most four fetches a day.
export const SOURCE_LIMITS: Record<string, { perDay: number }> = {
  remotive: { perDay: 4 },
  himalayas: { perDay: 8 }, // per search term
  remoteok: { perDay: 4 },
  greenhouse: { perDay: 8 },
  lever: { perDay: 8 },
  ashby: { perDay: 8 },
};

export const REGIONS = ["US", "CA", "UK", "EMEA"] as const;
export type Region = (typeof REGIONS)[number];
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const EMPLOYMENT_TYPES = ["permanent", "fixed-term", "contract", "part-time", "internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const SENIORITY = ["intern", "junior", "mid", "senior", "lead", "principal"] as const;
export type Seniority = (typeof SENIORITY)[number];

// TR-01: the order a match moves through.
export const STATUSES = ["new", "applied", "response", "interview", "offer", "rejected", "dismissed", "expired"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  new: "Ready to apply",
  applied: "Applied",
  response: "Heard back",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  dismissed: "Not for me",
  expired: "Expired",
};
// Applied and everything after it: the documents are archived, and deleted after APPLIED_RETENTION_DAYS.
export const APPLIED_STATUSES: readonly Status[] = ["applied", "response", "interview", "offer", "rejected"];

// SC-01: how often new jobs are searched for, in hours. The scheduler checks every hour.
export const SEARCH_CADENCES = [
  { hours: 6, label: "Every 6 hours (4 times a day)" },
  { hours: 12, label: "Twice a day" },
  { hours: 24, label: "Once a day" },
  { hours: 48, label: "Every 2 days" },
  { hours: 168, label: "Once a week" },
] as const;
export const DEFAULT_SEARCH_EVERY = 6;

// NT-01: how often the digest email goes out.
export const DIGEST_EVERY = [1, 2] as const;
