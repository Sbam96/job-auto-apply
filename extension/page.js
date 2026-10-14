// Runs inside the job page (and any form frames) only when you click the extension.
// Reads the job, lists the form's questions, and fills in the answers the app sends back.
// It never presses submit.
(() => {
  if (window.__jaa) return;

  const clean = (s) => String(s ?? "").replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim();
  const textOf = (el) => clean(el?.textContent);

  // ---------- reading the job (EX-02, EX-06) ----------

  function jobPostings() {
    const out = [];
    const visit = (x) => {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(visit);
      const type = [].concat(x["@type"] ?? []);
      if (type.includes("JobPosting")) out.push(x);
      if (x["@graph"]) visit(x["@graph"]);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { visit(JSON.parse(s.textContent)); } catch { /* not JSON */ }
    }
    return out;
  }

  const htmlText = (html) => { const d = document.createElement("div"); d.innerHTML = String(html ?? ""); return d.innerText || d.textContent || ""; };
  const meta = (name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute("content") ?? "";

  function readPage() {
    const jp = jobPostings()[0];
    let title = "", company = "", place = "", description = "";
    if (jp) {
      title = clean(jp.title);
      const org = [].concat(jp.hiringOrganization ?? [])[0];
      company = clean(typeof org === "string" ? org : org?.name);
      const loc = [].concat(jp.jobLocation ?? [])[0]?.address;
      place = clean([loc?.addressLocality, loc?.addressRegion, typeof loc?.addressCountry === "string" ? loc.addressCountry : loc?.addressCountry?.name].filter(Boolean).join(", "));
      if (/TELECOMMUTE/i.test(jp.jobLocationType ?? "")) place = place ? `Remote - ${place}` : "Remote";
      description = htmlText(jp.description);
    }
    title ||= textOf(document.querySelector("h1")) || clean(meta("og:title")) || clean(document.title);
    company ||= clean(meta("og:site_name"));
    description ||= (document.querySelector("main, article, [role=main]") ?? document.body)?.innerText ?? "";
    return { url: location.href, title: title.slice(0, 200), company: company.slice(0, 200), location: place.slice(0, 200), description: description.slice(0, 20000), text: (document.body?.innerText ?? "").slice(0, 4000), fieldCount: scan().length, captcha: hasCaptcha() };
  }

  function hasCaptcha() {
    return !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"], .g-recaptcha, .h-captcha');
  }

  // ---------- listing the questions (EX-03) ----------

  function labelFor(el) {
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return textOf(l); }
    const by = el.getAttribute("aria-labelledby");
    if (by) return clean(by.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(" "));
    if (el.getAttribute("aria-label")) return clean(el.getAttribute("aria-label"));
    const wrap = el.closest("label") ?? el.closest("fieldset")?.querySelector("legend") ?? el.closest("div,li")?.querySelector("label");
    if (wrap) return textOf(wrap);
    return clean(el.getAttribute("placeholder") ?? el.getAttribute("name") ?? "");
  }

  const visible = (el) => {
    const s = getComputedStyle(el);
    // File inputs are often hidden behind a styled button; keep them.
    return el.type === "file" || (s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length > 0);
  };

  let fields = [];
  function scan() {
    const out = [];
    const seenRadio = new Set();
    let i = 0;
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const type = el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset", "search", "password"].includes(type) || el.disabled || !visible(el)) continue;
      const marker = el.getAttribute("data-jaa") ?? `jaa-${i++}-${Math.random().toString(36).slice(2, 7)}`;
      el.setAttribute("data-jaa", marker);
      const label = labelFor(el);
      const rawLabel = el.id ? (document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent ?? "") : label;
      const required = el.required || el.getAttribute("aria-required") === "true" || /\*\s*$/.test(String(rawLabel).trim());
      if (type === "radio") {
        if (!el.name || seenRadio.has(el.name)) continue;
        seenRadio.add(el.name);
        const group = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(el.name)}"]`)];
        const legend = textOf(el.closest("fieldset")?.querySelector("legend")) || clean(el.closest("[role=radiogroup]")?.getAttribute("aria-label")) || label;
        out.push({ label: legend, type: "radio", required: group.some((g) => g.required), options: group.map((g) => labelFor(g)), marker, name: el.name });
        continue;
      }
      const combo = el.getAttribute("role") === "combobox";
      out.push({
        label, type: combo ? "select" : FIELD_TYPE[type] ?? "text", required, marker, name: el.name ?? "", combo,
        options: el.tagName === "SELECT" ? [...el.options].map((o) => clean(o.text)).filter((t) => t && !/^(select|choose|please select)/i.test(t)) : undefined,
        maxLength: el.maxLength > 0 ? el.maxLength : undefined,
      });
    }
    fields = out.filter((f) => f.label);
    return fields;
  }
  const FIELD_TYPE = { text: "text", email: "email", tel: "tel", url: "url", number: "text", date: "text", checkbox: "checkbox", file: "file", textarea: "textarea", select: "select" };

  // ---------- filling (EX-03) ----------

  // React and similar frameworks ignore value changes unless they go through the native setter.
  function setValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  const same = (a, b) => clean(a).toLowerCase() === clean(b).toLowerCase();
  const starts = (a, b) => clean(a).toLowerCase().startsWith(clean(b).toLowerCase());
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function fileFrom(f) {
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    return new File([bytes], f.name, { type: f.type || "application/pdf" });
  }

  function mark(el, ok) {
    const target = el.type === "file" || el.type === "radio" ? (el.closest("fieldset, label, div") ?? el) : el;
    target.style.outline = ok ? "2px solid #176844" : "3px solid #d7263d";
    target.style.outlineOffset = "2px";
    if (!ok) target.setAttribute("data-jaa-todo", "1");
  }

  async function fillOne(f, answer, files) {
    const el = document.querySelector(`[data-jaa="${f.marker}"]`);
    if (!el) return false;
    if (answer.kind === "file-cv" || answer.kind === "file-cover") {
      const file = answer.kind === "file-cv" ? files.cv : files.cover;
      if (!file) return false;
      const dt = new DataTransfer();
      dt.items.add(fileFrom(file));
      el.files = dt.files;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.files?.length === 1;
    }
    if (f.type === "radio") {
      const group = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(f.name)}"]`)];
      const pick = group.find((r) => same(labelFor(r), answer.value)) ?? group.find((r) => starts(labelFor(r), answer.value));
      if (!pick) return false;
      pick.click();
      return pick.checked;
    }
    if (f.type === "checkbox") {
      if (!el.checked) el.click();
      return el.checked;
    }
    if (el.tagName === "SELECT") {
      const opt = [...el.options].find((o) => same(o.text, answer.value)) ?? [...el.options].find((o) => starts(o.text, answer.value));
      if (!opt) return false;
      setValue(el, opt.value);
      return true;
    }
    if (f.combo) {
      // Searchable dropdowns: type the answer, then pick the matching option from the list.
      el.focus();
      setValue(el, answer.value);
      await wait(400);
      const opts = [...document.querySelectorAll('[role="option"]')];
      const opt = opts.find((o) => same(o.textContent, answer.value)) ?? opts.find((o) => starts(o.textContent, answer.value));
      if (!opt) return false;
      opt.click();
      return true;
    }
    setValue(el, answer.value);
    return el.value === answer.value || el.value.length > 0;
  }

  async function fill(plan, files) {
    if (!fields.length) scan();
    const done = [];
    const failed = [];
    for (const answer of plan.answers) {
      const f = fields.find((x) => x.label === answer.label);
      if (!f) continue;
      let ok = false;
      try { ok = await fillOne(f, answer, files); } catch { ok = false; }
      const el = document.querySelector(`[data-jaa="${f.marker}"]`);
      if (el) mark(el, ok);
      (ok ? done : failed).push(answer.label);
    }
    for (const u of plan.unresolved) {
      const f = fields.find((x) => x.label === u.label);
      const el = f && document.querySelector(`[data-jaa="${f.marker}"]`);
      if (el) mark(el, false);
    }
    document.querySelector("[data-jaa-todo]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return { done, failed };
  }

  window.__jaa = { readPage, scan, fill, hasCaptcha };
})();
