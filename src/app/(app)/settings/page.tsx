import { requireUser } from "@/lib/session";
import { smtpConfigured } from "@/lib/mailer";
import { Card, PageHeader, secondaryButtonClass } from "@/components/ui";
import { DeleteAccount, WorkerToken } from "./SettingsForms";

export default async function SettingsPage() {
  const user = await requireUser();
  const llm = !!process.env.GEMINI_API_KEY;
  const mail = smtpConfigured();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card title="Setup status">
          <ul className="space-y-2 text-sm">
            <li>{llm ? "✓" : "✗"} AI tailoring {llm ? "is on (Gemini)" : "is off: without GEMINI_API_KEY, CVs use your own wording, reordered by relevance"}</li>
            <li>{mail ? "✓" : "✗"} Email {mail ? "is on" : "is off: add the SMTP settings in Render to get alerts and the midnight report"}</li>
          </ul>
        </Card>

        <Card title="Laptop worker">
          <p className="mb-3 text-sm text-muted">
            The worker runs on your laptop and fills in application forms in a real browser. It signs in with its own key. Generating a new key replaces the old one.
          </p>
          <WorkerToken />
        </Card>

        <Card title="Your data">
          <p className="mb-3 text-sm text-muted">Download everything held about you: account, profile, applications, history and what was submitted where.</p>
          <a href="/api/export" className={secondaryButtonClass} download>Download my data</a>
          <p className="mt-3 text-xs text-muted">Signed in as {user.email}. Your data isn&apos;t shared with anyone. The AI only sees job text and your CV bullets, never your name, contact details or self-ID answers.</p>
        </Card>

        <Card title="Delete account" className="border-bad/30">
          <p className="mb-3 text-sm text-muted">Permanently deletes your account and everything linked to it. This can&apos;t be undone.</p>
          <DeleteAccount />
        </Card>
      </div>
    </>
  );
}
