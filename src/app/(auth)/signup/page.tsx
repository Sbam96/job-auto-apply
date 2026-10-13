import { googleConfigured } from "@/lib/google";
import { AuthForm } from "../AuthForm";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  return <AuthForm mode="signup" notice={deleted ? "Your account and all its data have been deleted." : undefined} google={googleConfigured()} />;
}
