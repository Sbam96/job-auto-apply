import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getProfile } from "@/lib/store";
import { PageHeader } from "@/components/ui";
import { PreferencesForm } from "./PreferencesForm";

export default async function PreferencesPage() {
  const user = await requireUser();
  const profile = await getProfile(await getDb(), user.id);
  return (
    <>
      <PageHeader title="Job preferences" intro="What to look for. Location, employment type, level and pay are hard filters; everything else feeds the 0–100 score." />
      <PreferencesForm profile={profile} />
    </>
  );
}
