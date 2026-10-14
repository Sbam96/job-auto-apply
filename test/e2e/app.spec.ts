// Browser tests for the web app. Test names start with the requirement ID they prove.
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe.configure({ mode: "serial" });

const email = `ste+${Date.now()}@example.com`;
const password = "a very long password";

async function verifyLink(page: Page, to: string) {
  const res = await page.request.get(`/api/test/outbox?to=${encodeURIComponent(to)}`);
  const { mail } = await res.json();
  const link = String(mail[0].body).match(/https?:\/\/\S+\/verify\?token=\S+/)?.[0];
  expect(link).toBeTruthy();
  return link!;
}

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
}

test("AU-01 a short password is refused", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("short");
  // The browser's own minlength check stops it; remove it to test the server too.
  await page.locator("#password").evaluate((el) => el.removeAttribute("minlength"));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("at least 10 characters");
});

test("AU-01 sign up with email and password", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
});

test("AU-02 the app can't be used until the email is verified, then it can", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/check-email/); // unverified: sent to confirm first
  await page.goto("/");
  await expect(page).toHaveURL(/\/check-email/);
  await page.goto("/cv");
  await expect(page).toHaveURL(/\/check-email/);
  await page.goto(await verifyLink(page, email));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^(Morning|Afternoon|Evening|Up late)\.$/);
  await expect(page.getByRole("heading", { name: "Finish setting up" })).toBeVisible();
});

test("AU-02 a used verification link doesn't work twice", async ({ page }) => {
  await page.goto(await verifyLink(page, email));
  await expect(page).toHaveURL(/\/login\?expired=1/);
});

test("AU-03 log out, a wrong password is refused, the right one works", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("not the password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("don't match");
  await login(page);
});

test("PR-04 stored answers save and survive a reload", async ({ page }) => {
  await login(page);
  await page.goto("/profile");
  await page.getByLabel("Full name").fill("Alex Example");
  await page.getByLabel("Phone").fill("+44 7700 900000");
  await page.getByLabel("Expected salary (USD a year)").fill("110000");
  await page.getByLabel("Expected salary (GBP a year)").fill("60,000");
  await page.getByLabel("Notice period / start date").fill("1 month");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByLabel("Expected salary (GBP a year)")).toHaveValue("60000");
  await expect(page.getByLabel("Notice period / start date")).toHaveValue("1 month");
});

test("PR-05 self-ID questions default to prefer not to say", async ({ page }) => {
  await login(page);
  await page.goto("/profile");
  for (const label of ["Veteran status", "Disability status", "Race / ethnicity", "Gender"]) {
    await expect(page.getByLabel(label)).toHaveValue("");
    await expect(page.getByLabel(label)).toHaveAttribute("placeholder", "Prefer not to say");
  }
});

test("PR-01 work history is shown newest first after saving", async ({ page }) => {
  await login(page);
  await page.goto("/cv");
  const addRole = async (title: string, employer: string, start: string, end: string) => {
    await page.getByRole("button", { name: "+ Add role" }).click();
    const role = page.locator("[data-role]").first();
    await role.getByLabel("Job title").fill(title);
    await role.getByLabel("Employer").fill(employer);
    await role.getByLabel("Start").fill(start);
    if (end) await role.getByLabel("End").fill(end);
    await role.getByLabel("Responsibilities and achievements").fill(`- Wrote user stories in Jira at ${employer}\n• Ran stakeholder workshops at ${employer}`);
  };
  await addRole("Analyst", "Firstco", "2018-09", "2022-12");
  await addRole("Business Analyst", "Insureco", "2023-01", "2026-06");
  await addRole("Consultant", "Consultco", "2026-07", "");
  await page.getByRole("button", { name: "Save CV" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  const employers = await page.locator("[data-role]").evaluateAll((els) => els.map((e) => (e.querySelector('input[id^="e-"]') as HTMLInputElement).value));
  expect(employers).toEqual(["Consultco", "Insureco", "Firstco"]);
  await expect(page.locator("[data-role]").nth(1).getByLabel("Responsibilities and achievements")).toHaveValue("Wrote user stories in Jira at Insureco\nRan stakeholder workshops at Insureco");
});

test("PR-07 a role can record its project or department", async ({ page }) => {
  await login(page);
  await page.goto("/cv");
  const role = page.locator("[data-role]").first();
  await role.getByLabel("Project or department (optional)").fill("Data Strategy programme");
  await page.getByRole("button", { name: "Save CV" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.locator("[data-role]").first().getByLabel("Project or department (optional)")).toHaveValue("Data Strategy programme");
});

test("PR-03 skills bank: ticked items are kept separately from CV skills", async ({ page }) => {
  await login(page);
  await page.goto("/cv");
  await page.getByLabel("Add a CV skill").fill("SQL");
  await page.getByLabel("Add a CV skill").press("Enter");
  await page.getByRole("button", { name: "+ Miro" }).click();
  await expect(page.getByRole("checkbox", { name: "Miro" })).toBeChecked();
  await page.getByRole("button", { name: "Save CV" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Miro" })).toBeChecked();
});

test("PR-06 up to 4 locations, each with work modes and cities", async ({ page }) => {
  await login(page);
  await page.goto("/preferences");
  await expect(page.locator("[data-location]")).toHaveCount(4);
  await expect(page.getByText("4 of 4")).toBeVisible();
  const uk = page.locator('[data-location="UK"]');
  await uk.getByLabel("Cities (for hybrid and on-site)").fill("Manchester, London");
  await page.locator('[data-location="CA"]').getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: "+ Canada" })).toBeVisible();
  await page.getByLabel("Minimum (GBP a year)").fill("50000");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.locator("[data-location]")).toHaveCount(3);
  await expect(page.locator('[data-location="UK"]').getByLabel("Cities (for hybrid and on-site)")).toHaveValue("Manchester, London");
});

test("TR-01 an application moves through approval, applied and interview", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email } })).json();
  await page.goto("/applications");
  await page.getByRole("link", { name: "Business Analyst" }).first().click();
  await expect(page.getByRole("heading", { name: "Approve this application?" })).toBeVisible();
  await expect(page.getByText("Wrote user stories in Jira at Insureco")).toBeVisible();
  await page.getByRole("button", { name: "I applied myself" }).click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "applied");
  await page.getByLabel("New status").selectOption("interview");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "interview");
  await expect(page.getByText("applied → interview")).toBeVisible();
  expect(id).toBeGreaterThan(0);
});

test("WA-01 a US application shows not-authorised answers and the immigration text", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Usco", region: "US" } })).json();
  await page.goto(`/applications/${id}`);
  const answers = page.locator("section", { has: page.getByRole("heading", { name: "Answers it will give" }) });
  await expect(answers.getByText("No", { exact: true })).toBeVisible();
  await expect(answers.getByText("Yes", { exact: true })).toBeVisible();
  await expect(answers).toContainText("eligible to apply for permanent residence");
});

test("DP-03 the worker's submission is logged and the application marked applied", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Generate worker key" }).click();
  const token = (await page.locator("[data-worker-token]").textContent())!.trim();
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Workerco", status: "queued" } })).json();
  const auth = { Authorization: `Bearer ${token}` };
  const next = await (await page.request.get("/api/worker/next?mode=auto", { headers: auth })).json();
  expect(next.application.id).toBe(id);
  expect(next.cvHtml).toContain("Alex Example");
  const res = await page.request.post("/api/worker/result", { headers: auth, data: { id, outcome: "applied", targetUrl: "https://job-boards.greenhouse.io/acme/jobs/1", payload: { "First Name": "Alex" } } });
  expect(res.ok()).toBe(true);
  await page.goto(`/applications/${id}`);
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "applied");
  await expect(page.getByText("submitted to https://job-boards.greenhouse.io/acme/jobs/1")).toBeVisible();
  expect((await page.request.get("/api/worker/next?mode=auto", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("TR-04 a queued application can be cancelled, and the worker then won't pick it up", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Generate worker key" }).click();
  const token = (await page.locator("[data-worker-token]").textContent())!.trim();
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Cancelco", status: "queued" } })).json();
  await page.goto(`/applications/${id}`);
  await expect(page.getByRole("heading", { name: "Queued to submit" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel this application" }).click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "skipped");
  await expect(page.getByText("Cancelled before it was submitted")).toBeVisible();
  const next = await (await page.request.get("/api/worker/next?mode=auto", { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(next.application?.id).not.toBe(id);
});

test("TR-03 the worker flagging a form emails the user", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("button", { name: "Generate worker key" }).click();
  const token = (await page.locator("[data-worker-token]").textContent())!.trim();
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Essayco", status: "queued" } })).json();
  await page.request.post("/api/worker/result", { headers: { Authorization: `Bearer ${token}` }, data: { id, outcome: "needs_action", unresolved: [{ label: "Why Essayco?", reason: "essay question" }] } });
  const { mail } = await (await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`)).json();
  expect(mail[0].subject).toBe("Action needed: Business Analyst at Essayco");
  await page.goto(`/applications/${id}`);
  await expect(page.getByRole("heading", { name: "This needs your input" })).toBeVisible();
  await expect(page.getByText("Why Essayco?")).toBeVisible();
});

test("TR-02 the midnight report needs the cron secret and sends once a day", async ({ page }) => {
  expect((await page.request.post("/api/cron/report?force=1")).status()).toBe(401);
  const auth = { Authorization: "Bearer e2e-cron-secret-1234567890" };
  const first = await (await page.request.post("/api/cron/report?force=1", { headers: auth })).json();
  const second = await (await page.request.post("/api/cron/report?force=1", { headers: auth })).json();
  expect(first.sent).toBeGreaterThanOrEqual(1);
  expect(second.sent).toBe(0);
  const { mail } = await (await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`)).json();
  expect(mail[0].body).toContain("Your job applications for");
});

test("DP-01 the user can download all their data", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download my data" }).click()]);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString());
  const data = JSON.parse(text);
  expect(data.account.email).toBe(email);
  expect(data.profile.fullName).toBe("Alex Example");
  expect(data.applications.length).toBeGreaterThanOrEqual(3);
  expect(text).not.toContain("password_hash");
});

test("A11Y main pages have no serious accessibility problems", async ({ page }) => {
  await login(page);
  for (const path of ["/", "/applications?view=all", "/cv", "/profile", "/preferences", "/companies", "/settings"]) {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${path}: ${v.id} on ${v.nodes.slice(0, 3).map((n) => `${n.target.join(" ")} (${(n.failureSummary ?? "").split("\n").slice(1).join(" ").trim()})`).join("; ")}`)).toEqual([]);
  }
});

test("AU-04 another user can't open someone else's application", async ({ page, browser }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Privateco" } })).json();
  const other = await (await browser.newContext()).newPage();
  const otherEmail = `other+${Date.now()}@example.com`;
  await other.goto("/signup");
  await other.getByLabel("Email").fill(otherEmail);
  await other.getByLabel("Password").fill(password);
  await other.getByRole("button", { name: "Create account" }).click();
  await expect(other.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await other.goto(await verifyLink(other, otherEmail));
  const res = await other.goto(`/applications/${id}`);
  expect(res?.status()).toBe(404);
});

test("DP-02 deleting the account removes it and logs out", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("Your account and all its data have been deleted.")).toBeVisible();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("don't match");
});
