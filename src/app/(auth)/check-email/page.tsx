import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { smtpConfigured } from "@/lib/mailer";
import { logoutAction } from "@/app/actions";
import { ResendButton } from "./ResendButton";

export default async function CheckEmailPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.verifiedAt) redirect("/");
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold">Confirm your email</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a link to <strong className="text-ink">{user.email}</strong>. Open it to finish setting up. Nothing is searched or sent until you do.
      </p>
      {!smtpConfigured() && (
        <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Email sending isn&apos;t set up on this server yet, so the link is in the server logs. Add the SMTP settings in Render to send real emails.
        </p>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <ResendButton />
        <form action={logoutAction}><button className="text-sm text-muted hover:text-ink">Log out</button></form>
      </div>
    </div>
  );
}
