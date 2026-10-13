import { AuthForm } from "../AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ verified?: string; expired?: string }> }) {
  const { verified, expired } = await searchParams;
  const notice = verified ? "Email confirmed. Log in to continue." : expired ? "That link has expired or was already used. Log in to get a new one." : undefined;
  return <AuthForm mode="login" notice={notice} />;
}
