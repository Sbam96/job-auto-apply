import { googleConfigured } from "@/lib/google";
import { AuthForm } from "../AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; expired?: string; google?: string }> }) {
  const { verified, expired, google } = await searchParams;
  const notice = verified ? "Email confirmed. Log in to continue." : expired ? "That link has expired or was already used. Log in to get a new one." : google ? "Google sign-in didn't complete. Try again, or use your email." : undefined;
  return <AuthForm mode="login" notice={notice} google={googleConfigured()} />;
}
