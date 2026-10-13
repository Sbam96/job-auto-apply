// Postgres connection and schema (Neon in production). The schema is created on first use.
import pg from "pg";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  verified_at TIMESTAMPTZ,
  worker_token_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS boards (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ats TEXT NOT NULL,
  board TEXT NOT NULL,
  company TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_error TEXT,
  UNIQUE (user_id, ats, board)
);
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT NOT NULL,
  remote BOOLEAN NOT NULL DEFAULT false,
  url TEXT NOT NULL,
  description TEXT NOT NULL,
  employment_type TEXT,
  salary JSONB,
  ats TEXT,
  attribution TEXT,
  posted_at TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  dedupe_key TEXT NOT NULL,
  region TEXT NOT NULL,
  mode TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT '{}',
  score INTEGER NOT NULL,
  breakdown JSONB NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL,
  flags JSONB NOT NULL DEFAULT '[]',
  tailored JSONB NOT NULL,
  unresolved JSONB NOT NULL DEFAULT '[]',
  note TEXT,
  created_day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS applications_user_status ON applications (user_id, status);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS submissions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  target_url TEXT NOT NULL,
  payload JSONB NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS source_fetches (
  key TEXT NOT NULL,
  day DATE NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, day)
);
CREATE TABLE IF NOT EXISTS report_runs (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS search_runs (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  summary JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mail_outbox (
  id SERIAL PRIMARY KEY,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export interface Db {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<pg.QueryResult<R>>;
  tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

// Accepts what Neon shows: a plain connection string, or one inside "psql '...'" or "DATABASE_URL=...".
export function cleanUrl(raw: string): string {
  const m = String(raw ?? "").match(/(postgres(?:ql)?:\/\/[^\s"'`]+)/i);
  return m ? m[1] : String(raw ?? "").trim();
}

export async function openDb(rawUrl: string): Promise<Db> {
  const url = cleanUrl(rawUrl);
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const pool = new pg.Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: true }, // Neon requires TLS
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000, // Neon can take a few seconds to wake
  });
  pool.on("error", (err) => console.error("[db] idle client error", err.message));
  await pool.query(SCHEMA);
  return {
    query: (text, params) => pool.query(text, params as unknown[]),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn(client);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

// One shared connection per server process (survives Next.js dev reloads).
const g = globalThis as unknown as { __jaaDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Add your Neon connection string in Render's environment settings.");
  g.__jaaDb ??= openDb(url).catch((err) => { g.__jaaDb = undefined; throw err; });
  return g.__jaaDb;
}
