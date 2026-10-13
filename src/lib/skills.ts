// Skills and tools the scorer looks for, in plain code (no LLM, so scoring costs nothing).
// Each skill has the phrasings people actually use, so "eliciting requirements" on a CV
// counts as "requirements gathering" in a job ad.

const GROUPS: Record<string, string[]> = {
  // analysis
  "requirements gathering": ["requirements gathering", "gathering requirements", "gather requirements", "requirements elicitation", "elicit requirements", "eliciting requirements", "eliciting and managing requirements", "elicitation", "requirements analysis", "requirements management", "capturing requirements", "capture requirements", "managing requirements", "business requirements", "functional requirements", "non-functional requirements"],
  "user stories": ["user stories", "user story"],
  "acceptance criteria": ["acceptance criteria"],
  "use cases": ["use cases", "use case"],
  "process mapping": ["process mapping", "process maps", "process map", "mapped processes", "mapping processes", "mapped the", "process modelling", "process modeling", "business process", "business processes", "end-to-end processes", "end to end processes", "as-is", "to-be", "current state", "future state", "journey mapping", "customer journeys"],
  "process improvement": ["process improvement", "continuous improvement", "process optimisation", "process optimization"],
  "gap analysis": ["gap analysis"],
  "root cause analysis": ["root cause analysis", "root cause"],
  "impact analysis": ["impact analysis", "impact assessment"],
  "cost-benefit analysis": ["cost-benefit analysis", "cost benefit analysis", "business case", "business cases", "options appraisal"],
  "swot": ["swot"],
  "moscow": ["moscow"],
  "stakeholder management": ["stakeholder management", "stakeholder engagement", "managing stakeholders", "engaging stakeholders", "engaged stakeholders", "stakeholders", "smes", "subject matter experts", "senior leadership"],
  "workshop facilitation": ["workshop facilitation", "facilitated workshops", "facilitating workshops", "facilitated", "workshops", "workshop"],
  "data analysis": ["data analysis", "analysing data", "analyzing data", "data analytics"],
  "data modelling": ["data modelling", "data modeling", "data model", "data models"],
  "data mapping": ["data mapping"],
  "data quality": ["data quality"],
  "data governance": ["data governance"],
  "data strategy": ["data strategy"],
  "reporting": ["reporting", "reports"],
  "dashboards": ["dashboards", "dashboard"],
  "kpis": ["kpis", "kpi", "okrs", "metrics"],
  "uat": ["uat", "user acceptance testing", "user acceptance test"],
  "testing": ["testing", "test cases", "test scripts", "test plans"],
  "change management": ["change management", "business change", "change impact", "organisational change", "organizational change"],
  "target operating model": ["target operating model", "operating model"],
  "specifications": ["functional specifications", "functional specification", "specifications", "non-functional specifications", "requirements documents", "brds", "brd", "frd"],
  // methods
  "agile": ["agile"],
  "scrum": ["scrum"],
  "kanban": ["kanban"],
  "safe": ["scaled agile", "safe framework"],
  "waterfall": ["waterfall"],
  "prince2": ["prince2"],
  "babok": ["babok", "iiba", "cbap", "ccba"],
  "bcs": ["bcs business analysis", "bcs certificate", "bcs diploma"],
  "bpmn": ["bpmn"],
  "uml": ["uml"],
  "lean": ["lean six sigma", "lean"],
  "six sigma": ["six sigma"],
  "design thinking": ["design thinking"],
  "product discovery": ["product discovery", "discovery phase", "discovery work"],
  "product management": ["product management"],
  "roadmap": ["roadmap", "roadmaps"],
  "backlog": ["backlog", "backlog management", "backlog refinement"],
  "prioritisation": ["prioritisation", "prioritization", "prioritising", "prioritizing"],
  // tools
  "jira": ["jira"],
  "confluence": ["confluence"],
  "miro": ["miro"],
  "visio": ["visio"],
  "lucidchart": ["lucidchart"],
  "excel": ["excel"],
  "power bi": ["power bi", "powerbi"],
  "tableau": ["tableau"],
  "looker": ["looker"],
  "sql": ["sql"],
  "python": ["python"],
  "salesforce": ["salesforce"],
  "servicenow": ["servicenow"],
  "sap": ["sap"],
  "microsoft dynamics": ["microsoft dynamics", "dynamics 365", "dynamics crm"],
  "figma": ["figma"],
  "aws": ["aws", "amazon web services"],
  "azure": ["azure"],
  "gcp": ["gcp", "google cloud"],
  "snowflake": ["snowflake"],
  "dbt": ["dbt"],
  "apis": ["api", "apis", "rest api", "rest apis", "integrations"],
  "json": ["json"],
  "xml": ["xml"],
  "etl": ["etl"],
  "fenergo": ["fenergo"],
  "guidewire": ["guidewire"],
  "pega": ["pega"],
  "appian": ["appian"],
  "alteryx": ["alteryx"],
  "google analytics": ["google analytics"],
  "notion": ["notion"],
  "smartsheet": ["smartsheet"],
  // domains
  "insurance": ["insurance", "insurer", "underwriting", "claims"],
  "life insurance": ["life insurance"],
  "health insurance": ["health insurance"],
  "pensions": ["pensions", "pension"],
  "wealth": ["wealth management", "wealth"],
  "financial services": ["financial services"],
  "banking": ["banking", "retail bank", "investment bank"],
  "fintech": ["fintech"],
  "payments": ["payments"],
  "lending": ["lending"],
  "regulatory": ["regulatory", "regulation", "regulatory change"],
  "compliance": ["compliance"],
  "kyc": ["kyc", "know your customer"],
  "aml": ["aml", "anti-money laundering"],
  "client onboarding": ["client onboarding", "customer onboarding", "broker onboarding", "clm"],
  "public sector": ["public sector", "government", "civil service", "central government"],
  "healthcare": ["healthcare", "nhs"],
  "consulting": ["consulting", "consultancy"],
  "digital transformation": ["digital transformation", "transformation", "modernisation", "modernization"],
  "cloud": ["cloud"],
  "saas": ["saas"],
  "crm": ["crm"],
  // ways of working: recognised, but never counted against you (see SOFT below)
  "communication": ["communication", "communicate"],
  "presentation": ["presentation", "presenting"],
  "documentation": ["documentation", "documenting"],
  "problem solving": ["problem solving", "problem-solving"],
  "critical thinking": ["critical thinking"],
  "collaboration": ["collaboration", "collaborating", "collaborative"],
  "mentoring": ["mentoring", "mentored", "coaching"],
};

// Soft skills almost every CV claims and every job lists. Matching them adds nothing useful,
// and treating them as "missing" unfairly drags scores down, so they're left out of scoring.
export const SOFT = new Set(["communication", "presentation", "documentation", "problem solving", "critical thinking", "collaboration", "mentoring"]);

export const SKILL_TERMS = Object.keys(GROUPS);

const VARIANT_TO_SKILL = new Map<string, string>();
for (const [skill, variants] of Object.entries(GROUPS)) for (const v of [skill, ...variants]) if (!VARIANT_TO_SKILL.has(v)) VARIANT_TO_SKILL.set(v, skill);

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => new RegExp(`(^|[^a-z0-9])${esc(w.toLowerCase())}($|[^a-z0-9])`, "i");

// The standard name for a skill as someone wrote it ("Stakeholder engagement" → "stakeholder management").
export function canonicalSkill(name: string): string {
  const k = String(name ?? "").trim().toLowerCase();
  return VARIANT_TO_SKILL.get(k) ?? k;
}

// Which known skills a piece of text mentions, by standard name. `extra` adds the user's own
// skill names that aren't in the dictionary.
export function skillsIn(text: string, extra: string[] = []): string[] {
  const t = String(text ?? "").toLowerCase();
  const found = new Set<string>();
  for (const [variant, skill] of VARIANT_TO_SKILL) if (variant.length >= 2 && wordRe(variant).test(t)) found.add(skill);
  for (const e of extra) {
    const c = canonicalSkill(e);
    if (c.length >= 2 && !found.has(c) && wordRe(e).test(t)) found.add(c);
  }
  return [...found];
}

// Hard skills only, for scoring.
export const hardSkills = (skills: string[]) => skills.filter((s) => !SOFT.has(s));
