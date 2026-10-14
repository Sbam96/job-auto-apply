import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getProfile } from "@/lib/store";
import { IMMIGRATION_TEXT } from "@/lib/workauth";
import { Card, PageHeader } from "@/components/ui";
import { deleteSavedAnswerAction, updateSavedAnswerAction } from "@/app/actions";
import { DetailsForm } from "./DetailsForm";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(await getDb(), user.id);
  return (
    <>
      <PageHeader title="Details & answers" intro="What goes into application forms. These answers are filled in by plain code; they're never sent to the AI." />
      <DetailsForm profile={profile} immigration={IMMIGRATION_TEXT} />
      <Card title="Answers you've taught it" className="mt-6">
        <p className="mb-4 text-sm text-muted">
          Questions the browser extension didn&apos;t know, that you answered and asked it to remember. It fills these in next time the same question comes up.
        </p>
        {profile.savedAnswers.length === 0 ? <p className="text-sm text-muted">None yet.</p> : (
          <ul className="divide-y divide-line" data-saved-answers>
            {profile.savedAnswers.map((a) => (
              <li key={a.question} className="py-3">
                <p className="mb-1 text-sm font-medium">{a.question}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateSavedAnswerAction} className="flex flex-1 gap-2">
                    <input type="hidden" name="question" value={a.question} />
                    <input name="answer" defaultValue={a.answer} className="input flex-1" aria-label={`Answer to: ${a.question}`} maxLength={2000} />
                    <button className="text-sm font-medium text-accent">Save</button>
                  </form>
                  <form action={deleteSavedAnswerAction}><input type="hidden" name="question" value={a.question} /><button className="text-sm text-muted hover:text-bad" aria-label={`Forget: ${a.question}`}>Forget</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
