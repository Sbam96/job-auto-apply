import { requireUser } from "@/lib/session";
import { smtpConfigured } from "@/lib/mailer";
import { Card, PageHeader, secondaryButtonClass } from "@/components/ui";
import { getDb } from "@/lib/db";
import { extensionStatus, getProfile } from "@/lib/store";
import { revokeExtensionAction } from "@/app/actions";
import { DeleteAccount, ExtensionKey, Notifications } from "./SettingsForms";

export default async function SettingsPage() {
  const user = await requireUser();
  const llm = !!process.env.GEMINI_API_KEY;
  const mail = smtpConfigured();
  const db = await getDb();
  const [profile, ext] = await Promise.all([getProfile(db, user.id), extensionStatus(db, user.id)]);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-6">
        <Card title="Setup status">
          <ul className="space-y-2 text-sm">
            <li>{llm ? "✓" : "✗"} AI tailoring {llm ? "is on (Gemini)" : "is off: without GEMINI_API_KEY, CVs use your own wording, reordered by relevance"}</li>
            <li>{mail ? "✓" : "✗"} Email {mail ? "is on" : "is off: add the SMTP settings in Render to get the match emails"}</li>
          </ul>
        </Card>

        <Card title="Match emails">
          <p className="mb-3 text-sm text-muted">
            One email listing new matches with their documents ready, plus any still waiting for you. Sent to {user.email}. If there&apos;s nothing to tell you, nothing is sent.
          </p>
          <Notifications every={profile.digest.every} hour={profile.digest.hour} />
        </Card>

        <Card title="Browser extension">
          <p className="mb-3 text-sm text-muted">
            Fills job applications for you in Chrome, Edge or Brave: your details, work authorisation answers, and your tailored CV attached. It works on any job page, and you always press submit yourself.
          </p>
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm">
            <li><a href="/settings/extension" className="font-medium text-accent underline">Download the extension</a> and unzip it somewhere you&apos;ll keep it (e.g. Documents).</li>
            <li>In Chrome, go to <code>chrome://extensions</code>, turn on <strong>Developer mode</strong> (top right), click <strong>Load unpacked</strong> and choose the unzipped folder.</li>
            <li>Pin it from the jigsaw icon in the toolbar, then generate a key below and paste it into the extension.</li>
          </ol>
          <ExtensionKey />
          <p className="mt-3 text-xs text-muted" data-extension-status>
            {ext.connected ? (ext.seenAt ? `Connected. Last used ${ext.seenAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/London" })}.` : "A key has been generated but not used yet.") : "Not connected."}
          </p>
          {ext.connected && <form action={revokeExtensionAction} className="mt-2"><button className="text-xs text-muted underline hover:text-bad">Disconnect the extension</button></form>}
        </Card>

        <Card title="Your data">
          <p className="mb-3 text-sm text-muted">Download everything held about you: account, profile, matches, documents and history. Applied matches and their documents are deleted 6 months after you apply; dismissed and expired ones after 3 months.</p>
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
