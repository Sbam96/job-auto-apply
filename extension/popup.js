// The extension's window. Talks to the app with your connection key, and to the page through page.js.
/* global JAA_APP_URL */
const $ = (id) => document.getElementById(id);
const APP = JAA_APP_URL.replace(/\/$/, "");
let key = "";
let tabId = null;
let matchId = null;
let coverText = null;
let ready = [];

function status(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
}

async function api(path, init = {}) {
  const res = await fetch(`${APP}/api/ext/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401) { await disconnect(); throw new Error("Your connection key isn't valid any more. Connect again."); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `The app replied ${res.status}.`);
  return res;
}
const post = (path, body) => api(path, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());

// ---------- connecting (EX-01) ----------

async function connect() {
  key = $("key").value.trim();
  if (!key) return status("Paste the key from the app's Settings.", true);
  status("Connecting…");
  try {
    await api("me");
    await chrome.storage.local.set({ key });
    await start();
  } catch (err) {
    key = "";
    status(err.message, true);
  }
}

async function disconnect() {
  key = "";
  await chrome.storage.local.remove("key");
  $("main").hidden = true;
  $("connect").hidden = false;
  $("disconnect").hidden = true;
}

// ---------- the page you're on ----------

async function targetTab() {
  // ?tabId= lets the window be opened for a particular tab (used by the tests).
  const fromUrl = Number(new URLSearchParams(location.search).get("tabId"));
  if (fromUrl) return chrome.tabs.get(fromUrl);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function inject() {
  await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, files: ["page.js"] });
}

async function inFrames(func, args = [], frameIds) {
  const target = frameIds ? { tabId, frameIds } : { tabId, allFrames: true };
  return chrome.scripting.executeScript({ target, func, args });
}

function showJob(m, label) {
  $("job").hidden = false;
  $("jobEyebrow").textContent = label;
  $("jobTitle").textContent = m.title;
  $("jobMeta").textContent = `${m.company} · score ${m.score} · ${m.status === "new" ? "ready to apply" : m.status}`;
  $("fillBtn").hidden = false;
  $("appliedBtn").hidden = m.status !== "new";
  $("openApp").href = `${APP}/applications/${m.id}`;
}

async function start() {
  $("connect").hidden = true;
  $("main").hidden = false;
  $("disconnect").hidden = false;
  const me = await (await api("me")).json();
  $("who").textContent = `Connected as ${me.name || me.email}`;

  const tab = await targetTab();
  tabId = tab?.id ?? null;
  if (!tab || !/^https?:/.test(tab.url ?? "")) { status("Open a job application page, then click me again."); return; }
  try { await inject(); } catch { status("Chrome doesn't let extensions work on this page.", true); return; }

  status("Reading the page…");
  const [{ result: page }] = await inFrames(() => window.__jaa.readPage(), [], [0]);
  const res = await post("match", { url: page.url, title: page.title, company: page.company, text: page.text });
  ready = res.ready;
  // Multi-page forms: remember the match for this tab, so later pages don't need it found again.
  const remembered = (await chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`];
  const match = res.match ?? res.ready.find((r) => r.id === remembered) ?? null;
  if (match) {
    matchId = match.id;
    await chrome.storage.session.set({ [`tab:${tabId}`]: match.id });
    showJob(match, res.match ? "Your match for this page" : "Still filling");
  } else {
    $("pick").hidden = false;
    $("pickList").hidden = !res.ready.length;
    $("pickSelect").innerHTML = `<option value="">Choose a match…</option>${res.ready.map((r) => `<option value="${r.id}">${escapeHtml(r.title)} at ${escapeHtml(r.company)}</option>`).join("")}`;
  }
  const frames = await inFrames(() => window.__jaa.scan().length);
  const fieldCount = frames.reduce((n, f) => n + (f.result ?? 0), 0);
  status(fieldCount >= 2 ? "" : "There's no application form on this page yet. Click Apply on the page, then open me again.");
}

// ---------- a job you found yourself (EX-06) ----------

async function capture() {
  $("captureBtn").disabled = true;
  status("Reading the job and tailoring your CV… this takes about 20 seconds.");
  try {
    await inject();
    const [{ result: page }] = await inFrames(() => window.__jaa.readPage(), [], [0]);
    const res = await post("capture", page);
    matchId = res.match.id;
    await chrome.storage.session.set({ [`tab:${tabId}`]: matchId });
    $("pick").hidden = true;
    showJob(res.match, res.created ? "New match from this page" : "Already one of your matches");
    status(page.fieldCount >= 2 ? "Documents ready. Press Fill this form." : "Saved to your matches. Click Apply on the page, then open me again to fill the form.");
  } catch (err) {
    status(err.message, true);
  } finally {
    $("captureBtn").disabled = false;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// ---------- filling (EX-03, EX-04) ----------

async function fileFor(doc) {
  const res = await api(`file?id=${matchId}&doc=${doc}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: res.headers.get("X-File-Name") ?? `${doc}.pdf`, type: "application/pdf", base64: btoa(bin) };
}

async function fill() {
  if (!matchId) return;
  $("fillBtn").disabled = true;
  status("Reading the form…");
  try {
    await inject();
    const frames = (await inFrames(() => ({ fields: window.__jaa.scan(), captcha: window.__jaa.hasCaptcha() }))).filter((f) => f.result?.fields?.length);
    const fields = frames.flatMap((f) => f.result.fields);
    if (fields.length < 2) { status("There's no application form on this page yet. Click Apply on the page, then open me again.", true); return; }
    status("Getting your answers…");
    const plan = await post("plan", { id: matchId, fields: fields.map(({ label, type, required, options, maxLength }) => ({ label, type, required, options, maxLength })), captcha: frames.some((f) => f.result.captcha) });
    coverText = plan.coverLetter;
    const files = {};
    if (plan.answers.some((a) => a.kind === "file-cv")) { status("Attaching your CV…"); files.cv = await fileFor("cv"); }
    if (plan.answers.some((a) => a.kind === "file-cover")) files.cover = await fileFor("cover");
    status("Filling…");
    const done = [];
    const failed = [];
    for (const f of frames) {
      const labels = new Set(f.result.fields.map((x) => x.label));
      const part = { answers: plan.answers.filter((a) => labels.has(a.label)), unresolved: plan.unresolved.filter((u) => labels.has(u.label)) };
      const [{ result }] = await inFrames((p, fl) => window.__jaa.fill(p, fl), [part, files], [f.frameId]);
      done.push(...result.done);
      failed.push(...result.failed);
    }
    showResult(done, [...plan.unresolved.map((u) => `${u.label} (${u.reason})`), ...failed.map((l) => `${l} (couldn't fill this one)`)], plan.captcha);
    status("Check everything, then press the site's submit button.");
  } catch (err) {
    status(err.message, true);
  } finally {
    $("fillBtn").disabled = false;
  }
}

function showResult(done, todo, captcha) {
  const r = $("result");
  r.hidden = false;
  r.innerHTML = `<h2 class="ok">Filled ${done.length} field${done.length === 1 ? "" : "s"}</h2>` +
    (todo.length ? `<h2 class="todo">Left for you (outlined in red)</h2><ul>${todo.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : "<p>Nothing left to answer.</p>") +
    (captcha ? "<p class=\"todo\">There's a \"verify you're human\" check to tick yourself.</p>" : "");
  $("copyCover").hidden = !coverText;
}

async function markApplied() {
  try {
    await post("applied", { id: matchId });
    await chrome.storage.session.remove(`tab:${tabId}`);
    $("appliedBtn").hidden = true;
    status("Marked as applied. Good luck!");
  } catch (err) {
    status(err.message, true);
  }
}

// ---------- wiring ----------

$("connectBtn").addEventListener("click", connect);
$("key").addEventListener("keydown", (e) => { if (e.key === "Enter") connect(); });
$("disconnect").addEventListener("click", disconnect);
$("fillBtn").addEventListener("click", fill);
$("appliedBtn").addEventListener("click", markApplied);
$("captureBtn").addEventListener("click", capture);
$("copyCover").addEventListener("click", async () => { await navigator.clipboard.writeText(coverText ?? ""); $("copyCover").textContent = "Copied"; setTimeout(() => { $("copyCover").textContent = "Copy cover letter text"; }, 1500); });
$("pickSelect").addEventListener("change", async (e) => {
  const id = Number(e.target.value);
  if (!id) return;
  const m = ready.find((r) => r.id === id);
  if (!m) return;
  matchId = id;
  await chrome.storage.session.set({ [`tab:${tabId}`]: id });
  $("pick").hidden = true;
  showJob(m, "Filling for");
});
$("openApp").href = APP;

(async () => {
  key = (await chrome.storage.local.get("key")).key ?? "";
  if (!key) { $("connect").hidden = false; return; }
  try { await start(); } catch (err) { status(err.message, true); }
})();
