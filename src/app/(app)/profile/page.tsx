import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getProfile } from "@/lib/store";
import { IMMIGRATION_TEXT } from "@/lib/workauth";
import { PageHeader } from "@/components/ui";
import { DetailsForm } from "./DetailsForm";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getProfile(await getDb(), user.id);
  return (
    <>
      <PageHeader title="Details & answers" intro="What goes into application forms. These answers are filled in by plain code; they're never sent to the AI." />
      <DetailsForm profile={profile} immigration={IMMIGRATION_TEXT} />
    </>
  );
}
