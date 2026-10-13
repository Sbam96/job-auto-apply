// Shared test data. A believable BA profile and a job factory.
import { emptyProfile } from "@/lib/cv";
import type { Job, Profile } from "@/lib/types";

export const NOW = new Date("2026-10-13T12:00:00Z");

export function profile(over: Partial<Profile> = {}): Profile {
  return {
    ...emptyProfile(),
    fullName: "Alex Example",
    contactEmail: "alex@example.com",
    phone: "+44 7700 900000",
    homeCity: "Manchester, UK",
    linkedin: "https://linkedin.com/in/alex-example",
    portfolio: "https://alex.example.com",
    summary: "Business Analyst with experience in insurance and public sector data strategy.",
    targetTitles: ["Business Analyst"],
    seniority: "mid",
    salaryFloor: { usd: 90000, gbp: 50000 },
    expectedSalary: { usd: 110000, gbp: 60000 },
    noticePeriod: "1 month",
    usHoursOverlap: "Available until 8pm UK time, overlapping US Eastern mornings",
    experience: [
      {
        id: "r1", title: "Business Analyst", employer: "Insureco", location: "UK", start: "2023-01", end: "2026-06",
        bullets: [
          { id: "b1", text: "Mapped claims processes in Visio and cut handling time by 20%", status: "approved", source: "user" },
          { id: "b2", text: "Wrote user stories and acceptance criteria in Jira for 3 agile teams", status: "approved", source: "user" },
          { id: "b3", text: "Led SQL data analysis for regulatory reporting", status: "approved", source: "user" },
          { id: "b4", text: "Suggested: ran stakeholder workshops", status: "pending", source: "app" },
        ],
      },
      {
        id: "r2", title: "Consultant", employer: "Consultco", location: "UK", start: "2026-07", end: null,
        bullets: [{ id: "b5", text: "Shaping a national data strategy with stakeholder management across departments", status: "approved", source: "user" }],
      },
      {
        id: "r0", title: "Analyst", employer: "Firstco", location: "UK", start: "2018-09", end: "2022-12",
        bullets: [{ id: "b6", text: "Produced Excel reporting and dashboards", status: "approved", source: "user" }],
      },
    ],
    skills: [
      { name: "SQL", onCv: true, ticked: false, suggested: false },
      { name: "Jira", onCv: true, ticked: false, suggested: false },
      { name: "Visio", onCv: true, ticked: false, suggested: false },
      { name: "Excel", onCv: true, ticked: false, suggested: false },
      { name: "agile", onCv: true, ticked: false, suggested: false },
      { name: "user stories", onCv: true, ticked: false, suggested: false },
      { name: "acceptance criteria", onCv: true, ticked: false, suggested: false },
      { name: "stakeholder management", onCv: true, ticked: false, suggested: false },
      { name: "Miro", onCv: false, ticked: true, suggested: false },
      { name: "workshop facilitation", onCv: false, ticked: true, suggested: false },
      { name: "Tableau", onCv: false, ticked: false, suggested: true },
    ],
    ...over,
  };
}

let n = 0;
export function job(over: Partial<Job> = {}): Job {
  n += 1;
  return {
    source: "greenhouse",
    sourceId: `acme:${n}`,
    company: "Acme",
    title: "Business Analyst",
    location: "Remote - UK",
    remote: true,
    url: `https://boards.greenhouse.io/acme/jobs/${n}`,
    description: "We need a Business Analyst to write user stories and acceptance criteria in Jira, run SQL analysis, work in agile teams and manage stakeholders. Insurance experience a plus. 3+ years of experience.",
    employmentType: null,
    salary: null,
    postedAt: "2026-10-12",
    ats: "greenhouse",
    attribution: null,
    ...over,
  };
}
