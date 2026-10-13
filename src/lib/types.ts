import type { EmploymentType, Region, Seniority, WorkMode } from "./config";

export type BulletStatus = "approved" | "pending" | "rejected";

// PR-02: bullets the app suggests stay "pending" until the user approves them.
export interface Bullet {
  id: string;
  text: string;
  status: BulletStatus;
  source: "user" | "app";
}

export interface Role {
  id: string;
  title: string;
  employer: string;
  team?: string; // optional project or department
  location: string;
  start: string; // YYYY-MM
  end: string | null; // null = current
  bullets: Bullet[];
}

// PR-03: the skills bank. Only ticked skills, or ones already on the CV, can be used.
export interface Skill {
  name: string;
  onCv: boolean;
  ticked: boolean;
  suggested: boolean;
}

export interface UserLocation {
  region: Region;
  modes: WorkMode[];
  cities: string[];
}

export type SelfIdAnswer = "prefer_not" | string;

export interface Profile {
  fullName: string;
  contactEmail: string;
  phone: string;
  homeCity: string;
  linkedin: string;
  portfolio: string;
  summary: string;
  targetTitles: string[];
  seniority: Seniority;
  employmentTypes: EmploymentType[];
  salaryFloor: { usd: number | null; gbp: number | null };
  expectedSalary: { usd: number | null; gbp: number | null };
  noticePeriod: string;
  usHoursOverlap: string;
  locations: UserLocation[];
  auth: { usSponsorship: boolean; canadaSponsorship: boolean };
  selfId: { veteran: SelfIdAnswer; disability: SelfIdAnswer; race: SelfIdAnswer; gender: SelfIdAnswer };
  writingSamples: string[];
  experience: Role[];
  education: { institution: string; qualification: string; year: string }[];
  certifications: string[];
  skills: Skill[];
  thresholds: { apply: number; auto: number };
  paused: boolean;
}

export interface Salary {
  min: number | null;
  max: number | null;
  currency: string | null; // USD, GBP, EUR, CAD
}

// A job from any source, in one shape (SR-01 to SR-04).
export interface Job {
  source: "remotive" | "greenhouse" | "lever" | "ashby";
  sourceId: string;
  company: string;
  title: string;
  location: string;
  remote: boolean;
  url: string;
  description: string; // plain text
  employmentType: EmploymentType | null;
  salary: Salary | null;
  postedAt: string | null;
  ats: "greenhouse" | "lever" | "ashby" | null;
  attribution: string | null; // SR-01: Remotive requires credit and a link back
}
