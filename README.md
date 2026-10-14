# Job Auto-Apply

Finds remote and international roles you're eligible for, scores them against your master CV,
and for every match prepares an honest, tailored CV (plus a cover letter where you'd need
sponsorship or the job asks for one). You download them as PDF or Word, apply on the employer's
site yourself, and mark the match applied. Applied matches and their documents are deleted after
6 months. Built to the "Job Auto-Apply App: Requirements" doc.

## How it fits together

| Part | Where it runs | What it does |
| --- | --- | --- |
| Web app (Next.js) | Render, free | Sign-up, profile, master CV, preferences, matches, documents, tracking |
| Database | Neon, free | Accounts, profiles, jobs, applications, history |
| Scheduler | GitHub Actions, free | Calls the app 4 times a day to search, and hourly to tidy up and send match emails |
| AI | Gemini free tier | Rewords CV bullets and writes cover letters. Never sees your name, contact details or self-ID answers |

Scoring, filters, work-authorisation answers and the PDF and Word files are plain code. The AI only
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

## Using it

- Each match has its CV (and cover letter if needed) ready to download as PDF or Word. You can edit
  the text first, or regenerate it from your latest master CV.
- The match page lists the answers for application forms (work authorisation, the immigration
  wording for US roles, notice period, salary, links), each with a copy button.
- Press **I've applied** when you've sent it, then update progress (heard back, interview, offer, rejected).
- **Not for me** dismisses a match; **Block** stops a company being matched again (Companies page to undo).
- Match emails come daily or every two days at the hour you pick (Settings).

### Browser extension

Settings → Browser extension: download the zip (already pointed at your app), unzip it, then in
Chrome go to `chrome://extensions`, turn on Developer mode and choose **Load unpacked**. Generate a
connection key in Settings and paste it into the extension. On any application page, click the
icon: it recognises the match, fills your details, work-authorisation answers and diversity
questions, attaches the tailored CV PDF, and outlines anything left for you in red. It never
submits; press **Mark as applied** in the extension afterwards. On a job the app didn't find,
**Make a match from this page** reads the job and makes the tailored CV first. Essay questions get
**Draft an answer** (from your CV only, anything not on it flagged). Questions you answer yourself
can be remembered for next time (Details & answers lists them). The code is in `extension/`.

What's kept: untouched matches expire after 30 days; dismissed and expired ones are deleted after
3 months; applied ones, with their documents, after 6 months. A role you applied to isn't matched
again for 3 months.

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
