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

test("TR-01 a match goes from ready, to applied, to interview", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email } })).json();
  await page.goto("/applications");
  await page.getByRole("link", { name: "Business Analyst" }).first().click();
  await expect(page.getByRole("heading", { name: "Ready to apply" })).toBeVisible();
  await expect(page.getByText("Wrote user stories in Jira at Insureco")).toBeVisible();
  await page.getByRole("button", { name: "I've applied" }).click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "applied");
  await expect(page.getByText(/These documents and this record are deleted on/)).toBeVisible(); // RT-02
  await page.getByLabel("New status").selectOption("interview");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "interview");
  await expect(page.getByText("Applied → Interview")).toBeVisible();
  expect(id).toBeGreaterThan(0);
});

test("WA-01 a US match shows not-authorised answers and the immigration text, ready to copy", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Usco", region: "US" } })).json();
  await page.goto(`/applications/${id}`);
  const answers = page.locator("section", { has: page.getByRole("heading", { name: "Answers for the form" }) });
  await expect(answers.getByText("No", { exact: true })).toBeVisible();
  await expect(answers.getByText("Yes", { exact: true })).toBeVisible();
  await expect(answers).toContainText("eligible to apply for permanent residence");
});

test("SR-08 a job found on Himalayas links to the employer's own page, with Himalayas credited", async ({ page }) => {
  await login(page);
  const listing = "https://himalayas.app/companies/rubicon-path/jobs/senior-business-analyst";
  const found = await (await page.request.post("/api/test/seed", { data: { email, company: "Rubicon Path", source: "himalayas", url: listing, direct: { url: "https://jobs.lever.co/rubiconpath/2", via: "Rubicon Path's Lever job board" } } })).json();
  await page.goto(`/applications/${found.id}`);
  await expect(page.locator("[data-apply-link]")).toHaveAttribute("href", "https://jobs.lever.co/rubiconpath/2");
  await expect(page.getByText("Direct link found on Rubicon Path's Lever job board.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Himalayas" })).toHaveAttribute("href", listing);
  const missing = await (await page.request.post("/api/test/seed", { data: { email, company: "Hiddenco", source: "himalayas", url: "https://himalayas.app/companies/hiddenco/jobs/ba", direct: null } })).json();
  await page.goto(`/applications/${missing.id}`);
  await expect(page.locator("[data-apply-link]")).toHaveText("Find it on Hiddenco's site ↗");
  expect(await page.locator("[data-apply-link]").getAttribute("href")).toContain("google.com/search");
});

test("DOC-01 DOC-02 the CV downloads as a PDF and as a Word file", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Fileco" } })).json();
  await page.goto(`/applications/${id}`);
  for (const [name, start, ext] of [["CV (PDF)", "%PDF-", "pdf"], ["CV (Word)", "PK", "docx"]] as const) {
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name }).click()]);
    expect(download.suggestedFilename()).toBe(`Alex-Example-CV-Fileco.${ext}`);
    const bytes = Buffer.concat(await (await download.createReadStream()).toArray());
    expect(bytes.subarray(0, start.length).toString()).toBe(start);
  }
  await expect(page.getByRole("link", { name: "Cover letter (PDF)" })).toHaveCount(0);
  expect((await page.request.get(`/applications/${id}/download?doc=cover&format=pdf`)).status()).toBe(404);
});

test("DOC-03 the cover letter downloads when the match has one", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Letterco", region: "US", coverLetter: "I would bring strong requirements skills to Letterco." } })).json();
  await page.goto(`/applications/${id}`);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Cover letter (Word)" }).click()]);
  expect(download.suggestedFilename()).toBe("Alex-Example-Cover-Letter-Letterco.docx");
  await expect(page.getByRole("link", { name: "Cover letter (PDF)" })).toBeVisible();
});

test("DOC-04 you can edit the text before downloading, and regenerate it", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Editco" } })).json();
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Edit the text" }).click();
  await page.getByLabel("Summary").fill("Business Analyst who keeps it honest.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Business Analyst who keeps it honest.")).toBeVisible();
  await expect(page.getByText("Edited by you")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Regenerate" }).click();
  await expect(page.getByRole("status")).toContainText("Regenerated");
  await expect(page.getByText("Business Analyst who keeps it honest.")).toHaveCount(0);
});

test("BL-01 blocking a company dismisses its match and lists it on the Companies page", async ({ page }) => {
  await login(page);
  const { id } = await (await page.request.post("/api/test/seed", { data: { email, company: "Blockco" } })).json();
  await page.goto(`/applications/${id}`);
  await page.getByRole("button", { name: "Block Blockco" }).click();
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "dismissed");
  await page.goto("/companies");
  await expect(page.locator("[data-blocked]")).toContainText("Blockco");
  await page.getByRole("button", { name: "Unblock Blockco" }).click();
  await expect(page.locator("[data-blocked]")).toHaveCount(0);
});

test("NT-01 you choose how often the match email comes and when", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByLabel("How often").selectOption("2");
  await page.getByLabel("At (UK time)").selectOption("19");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByLabel("How often")).toHaveValue("2");
  await expect(page.getByLabel("At (UK time)")).toHaveValue("19");
});

test("NT-02 the hourly run needs the cron secret, and emails matches with documents ready", async ({ page }) => {
  expect((await page.request.post("/api/cron/report?force=1")).status()).toBe(401);
  const auth = { Authorization: "Bearer e2e-cron-secret-1234567890" };
  const run = await (await page.request.post("/api/cron/report?force=1", { headers: auth })).json();
  expect(run.sent).toBeGreaterThanOrEqual(1);
  const { mail } = await (await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`)).json();
  expect(mail[0].subject).toMatch(/new match|still ready/);
  expect(mail[0].body).toContain("CV ready");
});

test("UI-01 the app name takes you back to the dashboard", async ({ page }) => {
  await login(page);
  await page.goto("/settings");
  await page.getByRole("link", { name: /go to the dashboard/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Ready to apply" })).toBeVisible();
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
