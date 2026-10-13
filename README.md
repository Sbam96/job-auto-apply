# Job Auto-Apply

Finds remote and international roles you're eligible for, scores them against your master CV,
tailors an honest CV (and cover letter where it helps), and applies, either automatically on
simple forms or after your approval. Built to the "Job Auto-Apply App: Requirements v1" doc.

## How it fits together

| Part | Where it runs | What it does |
| --- | --- | --- |
| Web app (Next.js) | Render, free | Sign-up, profile, master CV, preferences, approval queue, tracking |
| Database | Neon, free | Accounts, profiles, jobs, applications, history |
| Scheduler | GitHub Actions, free | Calls the app 4 times a day to search, and at midnight for the report |
| Laptop worker | Your computer | Opens application forms in a real browser, fills them, submits |
| AI | Gemini free tier | Rewords CV bullets and writes cover letters. Never sees your name, contact details or self-ID answers |

Scoring, filters, work-authorisation answers and form filling are plain code. The AI only
rewords; a validator rejects any skill, number, title, employer or date it adds that isn't in
your master CV, and keeps your own words instead.

## Deploy (about 15 minutes)

1. **Neon:** create a project and copy its connection string.
2. **Render:** a Web Service from this repo is set up with the build and start commands below.
   Under Environment, fill in `DATABASE_URL`, `CRON_SECRET` and `GEMINI_API_KEY` (see `.env.example`).
   - Build: `npm ci && npm run build`
   - Start: `npm start`
3. **GitHub:** in this repo's Settings → Secrets and variables → Actions, add `APP_URL` (your Render
   address) and `CRON_SECRET` (the same value as in Render). The schedule in
   `.github/workflows/schedule.yml` then runs on its own. Run it once by hand from the Actions tab
   to check it works.
4. **Sign in with Google (optional):** create an OAuth client in Google Cloud Console (Web
   application, redirect URI `https://<your-app>/auth/google/callback`) and set
   `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Google accounts skip email verification.
5. **Email (recommended):** add the `SMTP_*` settings, ideally for a Gmail account used only for sending. Until then, emails (including the sign-up
   verification link) are written to the Render logs.
6. **Sign up** in the app, confirm your email, then fill in Details, Master CV and Preferences.

## The laptop worker

```
npm install
npx playwright install chromium
cp worker/.env.example worker/.env   # then add APP_URL and the key from Settings → Laptop worker
npm run worker                       # submits queued applications (85+ on simple forms)
npm run worker -- --review           # walks your approval queue: fills each form, you click submit
```

The worker uses its own browser profile in `worker/.profile`, so anything you sign in to there
stays signed in. Forms with a CAPTCHA, an essay question or an unknown required field are never
auto-submitted; you get an email instead.

## Test it

```
npm test                 # unit tests (instant: clock, network and AI are all faked)
TEST_DATABASE_URL=postgresql://… npm test   # also runs the database tests
npm run test:e2e         # browser tests; needs a throwaway Postgres in E2E_DATABASE_URL
```

Test names start with the requirement ID they prove, e.g. `MT-01 an EMEA role limited to
countries that exclude the UK is skipped`. The browser suite writes `test/e2e-results.json`,
keyed by requirement ID with pass/fail and detail. Bugs found in use get a regression test in
`test/bugfix.test.ts`, named `BUG n:`.

## Free-tier notes

- Render's free web service sleeps after a while idle. The scheduler wakes it before each run;
  the first page load after a quiet spell can take up to a minute.
- Remotive is fetched at most 4 times a day, as its terms ask, and jobs from it are credited.
- Gemini's free tier may use what's sent to improve Google's products. Only job text and CV
  bullets are sent. Switch to a paid model later with one environment variable.
- LinkedIn and Indeed aren't automated; their terms forbid it.
