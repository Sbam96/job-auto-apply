// The browser extension, loaded into a real Chromium: connect, recognise the job, fill the form,
// mark it applied. The extension is the zip you download from Settings.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

test.describe.configure({ mode: "serial" });

const email = `ext+${Date.now()}@example.com`;
const password = "a very long password";
let ext: BrowserContext;
let extDir = "";
let extId = "";
let key = "";
let matchId = 0;

// Chrome names an unpacked extension after its folder: SHA-256 of the path, written with letters a-p.
const extensionId = (path: string) => [...createHash("sha256").update(path).digest("hex").slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");

async function signUp(page: Page) {
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  const { mail } = await (await page.request.get(`/api/test/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(String(mail[0].body).match(/https?:\/\/\S+\/verify\?token=\S+/)![0]);
}

async function openPopupFor(formUrl: string) {
  const popup = await ext.newPage();
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  // Inside the extension page, `chrome.tabs` lists the open tabs.
  const tabId = await popup.evaluate(async (u) => {
    const tabs = (globalThis as unknown as { chrome: { tabs: { query: (q: object) => Promise<{ id: number; url?: string }[]> } } }).chrome.tabs;
    return (await tabs.query({})).find((t) => t.url?.startsWith(u))?.id;
  }, formUrl);
  await popup.goto(`chrome-extension://${extId}/popup.html?tabId=${tabId}`);
  return popup;
}

test.afterAll(async () => { await ext?.close(); });

test("EX-01 the extension downloads from Settings already pointed at this app, and connects with a key", async ({ page, baseURL }) => {
  await signUp(page);
  const seeded = await (await page.request.post("/api/test/seed", { data: {
    email, company: "Formco", region: "US", url: `${baseURL}/api/test/form?co=Formco`,
    profile: { fullName: "Alex Example", contactEmail: email, phone: "+44 7700 900000", linkedin: "https://linkedin.com/in/alex" },
  } })).json();
  matchId = seeded.id;

  await page.goto("/settings");
  await page.getByRole("button", { name: "Generate connection key" }).click();
  key = (await page.locator("[data-extension-key]").textContent())!.trim();
  const zip = await (await page.request.get("/settings/extension")).body();
  const files = unzipSync(new Uint8Array(zip));
  extDir = join(mkdtempSync(join(tmpdir(), "jaa-ext-")), "job-auto-apply-extension");
  for (const [name, bytes] of Object.entries(files)) {
    const path = join(dirname(extDir), name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
  }
  expect(readFileSync(join(extDir, "config.js"), "utf8")).toContain(baseURL!);

  ext = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "jaa-profile-")), {
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  extId = extensionId(extDir);
  const form = await ext.newPage();
  await form.goto(`${baseURL}/api/test/form?co=Formco`);
  const popup = await openPopupFor(`${baseURL}/api/test/form`);
  await popup.getByLabel("Connection key").fill("jaa_wrong");
  await popup.getByRole("button", { name: "Connect" }).click();
  await expect(popup.locator("#status")).toContainText("isn't valid");
  await popup.getByLabel("Connection key").fill(key);
  await popup.getByRole("button", { name: "Connect" }).click();
  await expect(popup.locator("#who")).toHaveText("Connected as Alex Example");
  await page.goto("/settings");
  await expect(page.locator("[data-extension-status]")).toContainText("Connected. Last used");
});

test("EX-02 EX-03 it recognises the job and fills the form: details, authorisation, CV attached", async ({ baseURL }) => {
  const form = ext.pages().find((p) => p.url().includes("/api/test/form"))!;
  const popup = await openPopupFor(`${baseURL}/api/test/form`);
  await expect(popup.locator("#jobEyebrow")).toHaveText("Your match for this page");
  await expect(popup.locator("#jobTitle")).toHaveText("Business Analyst");
  await popup.getByRole("button", { name: "Fill this form" }).click();
  await expect(popup.locator("#status")).toHaveText("Check everything, then press the site's submit button.");

  await expect(form.locator("#first_name")).toHaveValue("Alex");
  await expect(form.locator("#last_name")).toHaveValue("Example");
  await expect(form.locator("#email")).toHaveValue(email);
  await expect(form.locator("#phone")).toHaveValue("+44 7700 900000");
  await expect(form.locator("#linkedin")).toHaveValue("https://linkedin.com/in/alex");
  await expect(form.locator("#auth")).toHaveValue("No"); // WA-01: US role
  await expect(form.locator('input[name=sponsor][value="1"]')).toBeChecked();
  await expect(form.locator("#gender")).toHaveValue("Decline To Self Identify"); // PR-05
  const file = await form.locator("#resume").evaluate((el: HTMLInputElement) => ({ n: el.files?.length, name: el.files?.[0]?.name, size: el.files?.[0]?.size }));
  expect(file).toMatchObject({ n: 1, name: "Alex-Example-CV-Formco.pdf" });
  expect(file.size).toBeGreaterThan(500);

  // EX-04: the essay question is left for you, outlined, and listed in the extension.
  await expect(form.locator("#why")).toHaveValue("");
  await expect(form.locator("#why")).toHaveAttribute("data-jaa-todo", "1");
  await expect(popup.locator("#result")).toContainText("Why do you want to work at Formco?");
  expect(await form.evaluate(() => document.body.dataset.submitted)).toBeUndefined(); // never submits
  if (process.env.SHOTS) { await popup.setViewportSize({ width: 360, height: 560 }); await popup.screenshot({ path: `${process.env.SHOTS}/popup.png` }); await form.screenshot({ path: `${process.env.SHOTS}/form.png`, fullPage: true }); }
});

test("EX-05 Mark as applied updates the app", async ({ page, baseURL }) => {
  const popup = await openPopupFor(`${baseURL}/api/test/form`);
  await popup.getByRole("button", { name: "Mark as applied" }).click();
  await expect(popup.locator("#status")).toHaveText("Marked as applied. Good luck!");
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.goto(`/applications/${matchId}`);
  await expect(page.locator("[data-status]").first()).toHaveAttribute("data-status", "applied");
  await expect(page.getByText("Marked from the browser extension")).toBeVisible();
});
