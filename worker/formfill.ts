// Reads an application form in a real browser page and fills it from the plan (AP-01, AP-03).
// Works on standard Greenhouse, Lever and Ashby forms; anything unusual is left for the user.
import type { Page, Locator } from "@playwright/test";
import type { FormPlan, FormQuestion } from "../src/lib/forms";

export interface ScannedField extends FormQuestion { selector: string; name: string }

// Opens the form. Job pages often need an "Apply" click first, and job-board pages (Himalayas,
// Remote OK) send you on to the employer's site, sometimes in a new tab. Returns the page the
// form is on, which may not be the page passed in.
const FIELDS = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="search"]), textarea, select';

// The worker runs through tsx, which wraps named functions in a `__name(...)` helper. Code sent into
// the page with evaluate() keeps those calls, but the page has no such helper, so every read failed
// with "__name is not defined". This defines a harmless one in the page first.
const NAME_SHIM = "globalThis.__name = globalThis.__name || ((f) => f);";
export async function prepare(page: Page) {
  await page.evaluate(NAME_SHIM).catch(() => {});
}

export async function fieldCount(page: Page) {
  return page.locator(FIELDS).count().catch(() => 0);
}

async function clickApply(page: Page): Promise<Page> {
  const apply = page
    .getByRole("link", { name: /apply for this (job|position|role)|apply now|apply on (company|employer)|apply on .*site|^apply$|apply ↗/i })
    .or(page.getByRole("button", { name: /apply for this (job|position|role)|apply now|^apply$/i }))
    .first();
  if (!(await apply.count().catch(() => 0))) return page;
  const popup = page.context().waitForEvent("page", { timeout: 6000 }).catch(() => null);
  await apply.click().catch(() => {});
  const next = (await popup) ?? page;
  await next.waitForLoadState("domcontentloaded", { timeout: 30_000 }).catch(() => {});
  await next.waitForTimeout(2000);
  return next;
}

export async function openForm(page: Page, url: string, ats: string | null): Promise<Page> {
  const target = ats === "lever" && !/\/apply$/.test(url) ? `${url.replace(/\/$/, "")}/apply`
    : ats === "ashby" && !/\/application$/.test(url) ? `${url.replace(/\/$/, "")}/application`
    : url;
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1500);
  let current = page;
  // Up to two hops: job board → employer's job page → its application form.
  for (let hop = 0; hop < 2; hop++) {
    if ((await fieldCount(current)) >= 2) break;
    current = await clickApply(current);
  }
  return current;
}

export async function hasCaptcha(page: Page) {
  return (await page.locator('iframe[src*="recaptcha"]:visible, iframe[src*="hcaptcha"]:visible, iframe[src*="turnstile"]:visible, .g-recaptcha:visible, .h-captcha:visible').count()) > 0;
}

// Lists every fillable field with its human label, in page order.
export async function scanForm(page: Page): Promise<ScannedField[]> {
  await prepare(page);
  return page.evaluate(() => {
    const out: { label: string; type: string; required: boolean; options?: string[]; maxLength?: number; selector: string; name: string }[] = [];
    const seenRadio = new Set<string>();
    const textOf = (el: Element | null) => (el?.textContent ?? "").replace(/\s+/g, " ").replace(/\*$/, "").trim();
    const labelFor = (el: HTMLElement): string => {
      if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return textOf(l); }
      const by = el.getAttribute("aria-labelledby");
      if (by) return by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" ");
      if (el.getAttribute("aria-label")) return el.getAttribute("aria-label")!;
      const wrap = el.closest("label") ?? el.closest("fieldset")?.querySelector("legend") ?? el.closest("div,li")?.querySelector("label");
      if (wrap) return textOf(wrap);
      return el.getAttribute("placeholder") ?? el.getAttribute("name") ?? "";
    };
    const visible = (el: HTMLElement) => {
      const s = getComputedStyle(el);
      // File inputs are often hidden behind a styled button; keep them.
      return (el as HTMLInputElement).type === "file" || (s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0);
    };
    let i = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea"))) {
      const input = el as HTMLInputElement;
      const type = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : (input.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "search", "password"].includes(type) || !visible(el)) continue;
      const marker = `jaa-${i++}`;
      el.setAttribute("data-jaa", marker);
      const label = labelFor(el);
      const rawLabel = el.id ? (document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? "") : label;
      const required = input.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(rawLabel.trim());
      if (type === "radio") {
        if (seenRadio.has(input.name)) continue;
        seenRadio.add(input.name);
        const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type=radio][name="${CSS.escape(input.name)}"]`));
        const legend = textOf(input.closest("fieldset")?.querySelector("legend") ?? null) || label;
        out.push({ label: legend, type: "radio", required: group.some((g) => g.required), options: group.map((g) => labelFor(g)), selector: `[name="${input.name}"]`, name: input.name });
        continue;
      }
      out.push({
        label, type, required,
        options: el.tagName === "SELECT" ? Array.from((el as HTMLSelectElement).options).map((o) => o.text.trim()).filter((t) => t && !/^select/i.test(t)) : undefined,
        maxLength: input.maxLength > 0 ? input.maxLength : undefined,
        selector: `[data-jaa="${marker}"]`,
        name: input.name ?? "",
      });
    }
    return out;
  }) as Promise<ScannedField[]>;
}

// Fills the planned answers. Returns what was actually entered, for the submission log (DP-03).
export async function fillForm(page: Page, fields: ScannedField[], plan: FormPlan, files: { cv: string; cover: string | null }): Promise<Record<string, string>> {
  const entered: Record<string, string> = {};
  for (const a of plan.answers) {
    const f = fields.find((x) => x.label === a.label);
    if (!f) continue;
    const el: Locator = page.locator(f.selector).first();
    try {
      if (a.kind === "file-cv" || a.kind === "file-cover") {
        const path = a.kind === "file-cv" ? files.cv : files.cover;
        if (path) { await el.setInputFiles(path); entered[a.label] = path.split(/[\\/]/).pop()!; }
      } else if (f.type === "select") {
        await el.selectOption({ label: a.value });
        entered[a.label] = a.value;
      } else if (f.type === "radio") {
        // Pick the option in this group whose label matches; "Yes" appears in many groups.
        const radios = page.locator(`input[type=radio][name="${f.name}"]`);
        const n = await radios.count();
        let picked = false;
        for (let i = 0; i < n && !picked; i += 1) {
          const r = radios.nth(i);
          const label = await r.evaluate((el) => {
            const input = el as HTMLInputElement;
            const l = input.id ? document.querySelector(`label[for="${CSS.escape(input.id)}"]`) : input.closest("label");
            return (l?.textContent ?? input.value).replace(/\s+/g, " ").trim();
          });
          if (label === a.value) { await r.check(); picked = true; }
        }
        if (!picked) throw new Error("option not found");
        entered[a.label] = a.value;
      } else if (f.type === "checkbox") {
        await el.check();
        entered[a.label] = "checked";
      } else {
        await el.fill(a.value);
        entered[a.label] = a.value.length > 200 ? `${a.value.slice(0, 200)}…` : a.value;
      }
    } catch {
      // A custom widget the worker can't drive: leave it for the user.
      plan.unresolved.push({ label: a.label, reason: "couldn't fill this field automatically" });
    }
  }
  return entered;
}

export async function submitForm(page: Page): Promise<boolean> {
  const button = page.locator('button[type=submit], input[type=submit]').or(page.getByRole("button", { name: /submit( application)?|send application/i })).first();
  if (!(await button.count())) return false;
  const before = page.url();
  await button.click();
  // Confirmation: a thank-you message, or the page moving on.
  try {
    await page.waitForFunction((start) => location.href !== start || /thank you|application (has been )?(received|submitted)|we.ve received/i.test(document.body.innerText), before, { timeout: 20_000 });
    return true;
  } catch {
    return false;
  }
}
