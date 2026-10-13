// "Sign in with Google" (AU-05). Standard OAuth code flow, asking only for name and email.
// The ID token comes straight from Google's token endpoint over TLS, so its claims are checked
// (audience, issuer, expiry, verified email) rather than its signature, as OpenID Connect allows.

export const googleConfigured = (env: NodeJS.ProcessEnv = process.env) => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export function authUrl(clientId: string, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export interface GoogleIdentity { sub: string; email: string; name: string }

// Checks an ID token's claims and returns who signed in. Throws if anything is off.
export function identityFromIdToken(idToken: string, clientId: string, now: Date): GoogleIdentity {
  const [, payload] = String(idToken).split(".");
  if (!payload) throw new Error("Google didn't return an ID token.");
  const c = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  if (c.aud !== clientId) throw new Error("This sign-in was meant for a different app.");
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("This sign-in didn't come from Google.");
  if (typeof c.exp !== "number" || c.exp * 1000 < now.getTime()) throw new Error("The Google sign-in expired. Try again.");
  if (c.email_verified !== true || typeof c.email !== "string") throw new Error("Your Google account's email isn't verified.");
  return { sub: String(c.sub), email: c.email.toLowerCase(), name: typeof c.name === "string" ? c.name : "" };
}

export async function exchangeCode(code: string, opts: { clientId: string; clientSecret: string; redirectUri: string; fetchImpl?: typeof fetch; now?: Date }): Promise<GoogleIdentity> {
  const res = await (opts.fetchImpl ?? fetch)("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: opts.clientId, client_secret: opts.clientSecret, redirect_uri: opts.redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}).`);
  const body = (await res.json()) as { id_token?: string };
  return identityFromIdToken(body.id_token ?? "", opts.clientId, opts.now ?? new Date());
}
