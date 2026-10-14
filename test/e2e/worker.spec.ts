// The laptop worker's form filling, against a page shaped like a real Greenhouse form.
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canAutoSubmit, planForm } from "../../src/lib/forms";
import { emptyProfile } from "../../src/lib/cv";
import { IMMIGRATION_TEXT } from "../../src/lib/workauth";
import { fillForm, hasCaptcha, openForm, prepare, scanForm } from "../../worker/formfill";
import { pathToFileURL } from "node:url";

const profile = { ...emptyProfile(), fullName: "Alex Example", contactEmail: "alex@example.com", phone: "+44 7700 900000", linkedin: "https://linkedin.com/in/alex", homeCity: "Manchester, UK", expectedSalary: { usd: 110000, gbp: 60000 } };
const US = { region: "US", mode: "remote" } as const;

const form = (extra = "") => `<!doctype html><html><body><form>
  <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
  <label for="email">Email *</label><input id="email" type="email" required>
  <label for="phone">Phone *</label><input id="phone" type="tel" required>
  <label for="resume">Resume/CV *</label><input id="resume" type="file" required style="display:none">
  <label for="linkedin">LinkedIn Profile</label><input id="linkedin">
  <label for="auth">Are you legally authorized to work in the United States? *</label>
  <select id="auth" required><option>Select...</option><option>Yes</option><option>No</option></select>
  <fieldset><legend>Will you now or in the future require sponsorship? *</legend>
    <label><input type="radio" name="sponsor" value="1" required> Yes</label>
    <label><input type="radio" name="sponsor" value="0" required> No</label>
  </fieldset>
  <label for="gender">Gender</label><select id="gender"><option>Select...</option><option>Male</option><option>Female</option><option>Decline To Self Identify</option></select>
  <label for="vet">Veteran Status</label><select id="vet"><option>Select...</option><option>I am a protected veteran</option><option>I don't wish to answer</option></select>
  <label for="extra">Additional information</label><textarea id="extra"></textarea>
  ${extra}
  <button type="submit">Submit application</button>
</form></body></html>`;

function files() {
  const dir = mkdtempSync(join(tmpdir(), "jaa-"));
  const cv = join(dir, "Alex-CV.pdf");
  writeFileSync(cv, "%PDF-1.4 test");
  return { cv, cover: null };
}

test("AP-01 the worker fills a Greenhouse-style form completely from stored answers", async ({ page }) => {
  await page.setContent(form());
  const fields = await scanForm(page);
  const plan = planForm(fields, profile, US, { captcha: await hasCaptcha(page) });
  expect(plan.unresolved).toEqual([]);
  expect(canAutoSubmit(plan)).toBe(true);
  const entered = await fillForm(page, fields, plan, files());
  await expect(page.locator("#first_name")).toHaveValue("Alex");
  await expect(page.locator("#last_name")).toHaveValue("Example");
  await expect(page.locator("#phone")).toHaveValue("+44 7700 900000");
  expect(await page.locator("#resume").evaluate((el) => (el as HTMLInputElement).files?.[0]?.name)).toBe("Alex-CV.pdf");
  expect(entered["Resume/CV"]).toBe("Alex-CV.pdf");
});

test("WA-01 the worker answers US authorisation No and sponsorship Yes", async ({ page }) => {
  await page.setContent(form());
  const fields = await scanForm(page);
  await fillForm(page, fields, planForm(fields, profile, US), files());
  await expect(page.locator("#auth")).toHaveValue("No");
  await expect(page.locator('input[name=sponsor][value="1"]')).toBeChecked();
});

test("PR-05 the worker picks the decline option for self-ID questions", async ({ page }) => {
  await page.setContent(form());
  const fields = await scanForm(page);
  await fillForm(page, fields, planForm(fields, profile, US), files());
  await expect(page.locator("#gender")).toHaveValue("Decline To Self Identify");
  await expect(page.locator("#vet")).toHaveValue("I don't wish to answer");
});

test("WA-05 the worker puts the immigration text in the extra-information box on US roles", async ({ page }) => {
  await page.setContent(form());
  const fields = await scanForm(page);
  await fillForm(page, fields, planForm(fields, profile, US), files());
  await expect(page.locator("#extra")).toHaveValue(IMMIGRATION_TEXT.long);
});

test("AP-03 an essay question stops the worker from auto-submitting", async ({ page }) => {
  await page.setContent(form('<label for="why">Why do you want to work here? *</label><textarea id="why" required></textarea>'));
  const fields = await scanForm(page);
  const plan = planForm(fields, profile, US);
  expect(canAutoSubmit(plan)).toBe(false);
  expect(plan.unresolved.map((u) => u.label)).toEqual(["Why do you want to work here?"]);
});

test("AP-03 a CAPTCHA stops the worker from auto-submitting", async ({ page }) => {
  await page.setContent(form('<div class="g-recaptcha" style="width:300px;height:80px"></div>'));
  const fields = await scanForm(page);
  const plan = planForm(fields, profile, US, { captcha: await hasCaptcha(page) });
  expect(plan.captcha).toBe(true);
  expect(canAutoSubmit(plan)).toBe(false);
});

test("AP-01 a job-board page that opens the employer's form in a new tab is followed to the form", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "jaa-board-"));
  const formFile = join(dir, "form.html");
  writeFileSync(formFile, form());
  const boardFile = join(dir, "board.html");
  writeFileSync(boardFile, `<!doctype html><html><body><h1>Business Analyst at Acme</h1><p>Found on a job board.</p><a href="${pathToFileURL(formFile).href}" target="_blank">Apply on company site</a></body></html>`);
  const formPage = await openForm(page, pathToFileURL(boardFile).href, null);
  expect(formPage).not.toBe(page);
  const fields = await scanForm(formPage);
  expect(fields.map((f) => f.label)).toContain("Email");
});

test("AP-03 a page with no form is reported, not mistaken for one", async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), "jaa-none-"));
  const file = join(dir, "job.html");
  writeFileSync(file, "<!doctype html><html><body><h1>Business Analyst</h1><p>Sign in to apply.</p></body></html>");
  const formPage = await openForm(page, pathToFileURL(file).href, null);
  expect((await scanForm(formPage)).length).toBeLessThan(2);
});

test("BUG 4: on a laptop the worker runs through tsx, which adds __name() calls the page doesn't have; every form read failed", async ({ page }) => {
  await page.setContent(form());
  // What tsx produces for a named function inside evaluate():
  const compiled = "(() => { const f = __name(() => 1, 'f'); return f(); })()";
  await expect(page.evaluate(compiled)).rejects.toThrow(/__name is not defined/);
  await prepare(page);
  expect(await page.evaluate(compiled)).toBe(1);
  expect((await scanForm(page)).length).toBeGreaterThan(5);
});
