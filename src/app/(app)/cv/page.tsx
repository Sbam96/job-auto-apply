import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getProfile } from "@/lib/store";
import { SKILL_TERMS } from "@/lib/skills";
import { PageHeader } from "@/components/ui";
import { CvEditor } from "./CvEditor";

// Everyday BA skills to offer for the skills bank.
const COMMON = ["Miro", "Visio", "Lucidchart", "Confluence", "Jira", "Excel", "Power BI", "SQL", "BPMN", "UML", "workshop facilitation", "stakeholder management", "requirements gathering", "process mapping", "user stories", "acceptance criteria", "gap analysis", "root cause analysis", "UAT", "agile", "scrum", "communication", "documentation", "data analysis", "change management"]
  .filter((s) => SKILL_TERMS.includes(s.toLowerCase()));

export default async function CvPage() {
  const user = await requireUser();
  const profile = await getProfile(await getDb(), user.id);
  return (
    <>
      <PageHeader title="Master CV" intro="The single source of truth. Tailoring only reorders and rewords what's here, so add more bullets than any one CV would use." />
      <CvEditor profile={profile} common={COMMON} />
    </>
  );
}
