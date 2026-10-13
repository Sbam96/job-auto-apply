// Tunable constants. Each one names the requirement it serves.

export const APPLY_THRESHOLD = 75; // MT-06: jobs scoring under this are skipped
export const AUTO_SUBMIT_THRESHOLD = 85; // AP-01: at or above this, simple forms auto-submit
export const MAX_LOCATIONS = 4; // PR-06: US, Canada, UK, EMEA
export const PASSWORD_MIN = 10; // AU-01
export const SESSION_DAYS = 30;
export const VERIFY_TOKEN_HOURS = 48;
export const DAILY_APPLY_CAP = 10; // v1 target: 5 to 10 applications a day

// SR-01: Remotive asks for at most four fetches a day.
export const SOURCE_LIMITS: Record<string, { perDay: number }> = {
  remotive: { perDay: 4 },
  greenhouse: { perDay: 8 },
  lever: { perDay: 8 },
  ashby: { perDay: 8 },
};

export const SIMPLE_ATS = ["greenhouse", "lever", "ashby"] as const; // AP-01

export const REGIONS = ["US", "CA", "UK", "EMEA"] as const;
export type Region = (typeof REGIONS)[number];
export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const EMPLOYMENT_TYPES = ["permanent", "fixed-term", "contract", "part-time", "internship"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const SENIORITY = ["intern", "junior", "mid", "senior", "lead", "principal"] as const;
export type Seniority = (typeof SENIORITY)[number];

// TR-01: the order an application moves through.
export const STATUSES = ["skipped", "needs_approval", "needs_action", "queued", "applied", "response", "interview", "offer", "rejected", "withdrawn"] as const;
export type Status = (typeof STATUSES)[number];
export const STATUS_LABELS: Record<Status, string> = {
  skipped: "Skipped",
  needs_approval: "Awaiting your approval",
  needs_action: "Needs your input",
  queued: "Queued to submit",
  applied: "Applied",
  response: "Response received",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
