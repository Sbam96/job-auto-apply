// A dictionary of skills and tools the scorer looks for in job descriptions.
// Plain code, no LLM, so scoring costs nothing.

export const SKILL_TERMS: string[] = [
  // analysis
  "requirements gathering", "requirements analysis", "requirements elicitation", "user stories", "acceptance criteria", "use cases",
  "process mapping", "process modelling", "process improvement", "business process", "gap analysis", "root cause analysis",
  "impact analysis", "cost-benefit analysis", "swot", "moscow", "stakeholder management", "stakeholder engagement",
  "workshop facilitation", "workshops", "business case", "options appraisal", "data analysis", "data modelling", "data mapping",
  "data quality", "data governance", "data strategy", "reporting", "dashboards", "kpis", "okrs", "uat", "user acceptance testing",
  "test cases", "testing", "change management", "change impact", "business change", "target operating model", "current state", "future state",
  // methods
  "agile", "scrum", "kanban", "safe", "waterfall", "prince2", "babok", "bpmn", "uml", "lean", "six sigma", "design thinking",
  "product discovery", "product management", "roadmap", "backlog", "prioritisation", "prioritization",
  // tools
  "jira", "confluence", "miro", "visio", "lucidchart", "excel", "power bi", "tableau", "looker", "sql", "python", "r",
  "salesforce", "servicenow", "sap", "dynamics", "figma", "aws", "azure", "gcp", "snowflake", "dbt", "api", "apis", "rest",
  "json", "xml", "etl", "fenergo", "guidewire", "pega", "appian", "alteryx", "google analytics", "notion", "smartsheet",
  // domains
  "insurance", "life insurance", "health insurance", "pensions", "wealth", "financial services", "banking", "fintech",
  "payments", "lending", "regulatory", "regulation", "compliance", "kyc", "aml", "client onboarding", "clm", "public sector",
  "government", "civil service", "healthcare", "consulting", "digital transformation", "cloud", "saas", "crm",
  // ways of working
  "communication", "presentation", "documentation", "problem solving", "critical thinking", "collaboration", "mentoring",
];

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(^|[^a-z0-9])${esc(w.toLowerCase())}($|[^a-z0-9])`, "i");

// Which known skills a piece of text mentions.
export function skillsIn(text: string, extra: string[] = []): string[] {
  const t = String(text ?? "").toLowerCase();
  const found = new Set<string>();
  for (const term of [...SKILL_TERMS, ...extra]) {
    if (term.length < 2) continue;
    // A one-letter-word like "r" needs surrounding signal to avoid false hits.
    if (term === "r" && !/\b(r|python),? (and|or) (python|r)\b|\bin r\b/.test(t)) continue;
    if (wordRe(term).test(t)) found.add(term.toLowerCase());
  }
  return [...found];
}
