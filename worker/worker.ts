// The laptop worker. Run it on your own computer:
//   npm run worker            auto-submits queued applications (85+ on simple forms)
//   npm run worker -- --review  goes through your approval queue: fills each form, you click submit
// Settings come from worker/.env: APP_URL and WORKER_TOKEN (generate the key in the app's Settings).
import { chromium, type BrowserContext } from "@playwright/test";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { canAutoSubmit, planForm } from "../src/lib/forms";
import type { Profile } from "../src/lib/types";
import { fillForm, hasCaptcha, openForm, scanForm, submitForm } from "./formfill";
import type { Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const file = join(here, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

interface Next {
  application: { id: number; url: string; ats: string | null; title: string; company: string; region: "US" | "CA" | "UK" | "EMEA"; mode: "remote" | "hybrid" | "onsite"; countries: string[]; route: string; status: string; score: number } | null;
  profile: Profile;
  coverLetter: string | null;
  cvHtml: string;
}

async function main() {
  loadEnv();
  const review = process.argv.includes("--review");
  const headless = process.argv.includes("--headless") && !review;
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  const token = process.env.WORKER_TOKEN;
  if (!base || !token) {
    console.error("Set APP_URL and WORKER_TOKEN in worker/.env first. Generate the key in the app under Settings → Laptop worker.");
    process.exit(1);
  }
  const api = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    if (!res.ok) throw new Error(`${path} returned ${res.status}: ${await res.text()}`);
    return res.json();
  };
  const report = (body: unknown) => api("/api/worker/result", { method: "POST", body: JSON.stringify(body) });

  const files = join(here, ".files");
  mkdirSync(files, { recursive: true });
  // A persistent browser profile keeps you signed in to any job sites between runs.
  const context: BrowserContext = await chromium.launchPersistentContext(join(here, ".profile"), { headless, viewport: { width: 1280, height: 900 } });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let done = 0;

  try {
    for (;;) {
      const next = (await api(`/api/worker/next?mode=${review ? "review" : "auto"}`)) as Next;
      const app = next.application;
      if (!app) { console.log(done ? `Finished: ${done} handled.` : "Nothing to do. Check back after the next search."); break; }
      console.log(`\n→ ${app.title} at ${app.company} (${app.region}, score ${app.score})\n  ${app.url}`);

      // The CV and cover letter as PDFs, made from the tailored text.
      const page = await context.newPage();
      await page.setContent(next.cvHtml, { waitUntil: "load" });
      const safe = `${next.profile.fullName || "CV"}-${app.company}`.replace(/[^\w-]+/g, "-").slice(0, 60);
      const cvPath = join(files, `${safe}-CV.pdf`);
      await page.pdf({ path: cvPath, format: "A4", printBackground: false });
      let coverPath: string | null = null;
      if (next.coverLetter) {
        await page.setContent(`<html><body style="font-family:Arial;font-size:11pt;line-height:1.5;margin:20mm;white-space:pre-wrap">${next.coverLetter.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</body></html>`);
        coverPath = join(files, `${safe}-Cover-Letter.pdf`);
        await page.pdf({ path: coverPath, format: "A4" });
      }

      // Review mode always waits for a clear answer, so an application is never picked up twice by accident.
      const ask = async (prompt: string) => {
        for (;;) {
          const a = (await rl.question(prompt)).trim().toLowerCase();
          if (["s", "l", "k", "q"].includes(a)) return a;
          console.log("  Type s, l, k or q.");
        }
      };
      const closeAll = async (...pages: Page[]) => { for (const p of new Set(pages)) await p.close().catch(() => {}); };
      let formPage: Page = page;
      let quit = false;
      try {
        formPage = await openForm(page, app.url, app.ats);
        const fields = await scanForm(formPage);
        if (fields.length < 2) throw new Error("couldn't find the application form on the job page (the employer's site may need you to sign in or click through first)");
        const place = { region: app.region, mode: app.mode, countries: app.countries };
        const plan = planForm(fields, next.profile, place, { coverLetter: next.coverLetter, captcha: await hasCaptcha(formPage) });
        const entered = await fillForm(formPage, fields, plan, { cv: cvPath, cover: coverPath });
        const auto = app.status === "queued" && canAutoSubmit(plan) && !review;

        if (auto) {
          const ok = await submitForm(formPage);
          if (ok) { await report({ id: app.id, outcome: "applied", targetUrl: formPage.url(), payload: entered }); console.log("  ✓ Submitted."); }
          else { await report({ id: app.id, outcome: "needs_action", unresolved: [{ label: "Submit", reason: "no confirmation after submitting; check the page" }] }); console.log("  ! No confirmation; flagged for you."); }
          await closeAll(formPage, page);
        } else if (!review) {
          // Unattended: leave it for the user and email them (TR-03).
          const why = plan.captcha ? [{ label: "CAPTCHA", reason: "the form has a CAPTCHA" }, ...plan.unresolved] : plan.unresolved;
          await report({ id: app.id, outcome: "needs_action", unresolved: why });
          console.log(`  ! Needs you: ${why.map((u) => u.label).join("; ")}`);
          await closeAll(formPage, page);
        } else {
          // Review: everything known is filled in; the user checks it and clicks submit.
          if (plan.unresolved.length) console.log(`  Still to answer: ${plan.unresolved.map((u) => u.label).join("; ")}`);
          const answer = await ask("  Check the browser, submit it there, then type: [s] submitted  [l] later  [k] skip  [q] quit > ");
          if (answer === "s") await report({ id: app.id, outcome: "applied", targetUrl: formPage.url(), payload: entered });
          else if (answer === "k") await report({ id: app.id, outcome: "skipped" });
          else if (answer === "l") await report({ id: app.id, outcome: "needs_action", unresolved: plan.unresolved.length ? plan.unresolved : [{ label: "Review", reason: "left for later" }] });
          await closeAll(formPage, page);
          quit = answer === "q";
        }
      } catch (err) {
        const reason = (err as Error).message.split("\n")[0];
        console.log(`  ! ${reason}`);
        if (review) {
          // Keep the browser open so you can apply by hand. Your CV and cover letter are saved here:
          console.log(`  Apply in the browser yourself if you like. Your files: ${cvPath}${coverPath ? ` and ${coverPath}` : ""}`);
          const answer = await ask("  Then type: [s] submitted  [l] later  [k] skip  [q] quit > ");
          if (answer === "s") await report({ id: app.id, outcome: "applied", targetUrl: formPage.url(), payload: { note: "Submitted by hand" } });
          else if (answer === "k") await report({ id: app.id, outcome: "skipped" });
          else await report({ id: app.id, outcome: "needs_action", unresolved: [{ label: "Form", reason }] }).catch(() => {});
          quit = answer === "q";
        } else {
          await report({ id: app.id, outcome: "needs_action", unresolved: [{ label: "Form", reason }] }).catch(() => {});
        }
        await closeAll(formPage, page);
      }
      if (quit) break;
      done += 1;
      // Be gentle with job sites between unattended submissions.
      if (!review) await new Promise((r) => setTimeout(r, 20_000 + Math.random() * 40_000));
    }
  } finally {
    rl.close();
    await context.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
