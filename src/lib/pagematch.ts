// EX-02: which of your matches is the page you're on? Pure.
// First by address (the job link, the employer's link, or their /apply page), then by job title
// and company as read from the page.
import { titleSimilarity } from "./direct";
import { companyKey } from "./pipeline";

export interface PageInfo { url: string; title?: string; company?: string; text?: string }
export interface MatchCandidate { id: number; title: string; company: string; url: string; direct_url: string | null }

// Same job page, ignoring tracking parameters, fragments and the apply/application step.
export function normUrl(u: string): string {
  try {
    const x = new URL(u);
    const path = x.pathname.replace(/\/+$/, "").replace(/\/(apply|application|applications\/new)$/i, "");
    // Greenhouse embeds keep the job in ?gh_jid=; keep that one parameter.
    const jid = x.searchParams.get("gh_jid");
    return `${x.hostname.replace(/^www\./, "")}${path}${jid ? `?gh_jid=${jid}` : ""}`.toLowerCase();
  } catch {
    return String(u ?? "").toLowerCase();
  }
}

export function findMatchForPage<T extends MatchCandidate>(page: PageInfo, candidates: T[]): T | null {
  const here = normUrl(page.url);
  const byUrl = candidates.find((c) => [c.url, c.direct_url].filter(Boolean).some((u) => normUrl(u!) === here));
  if (byUrl) return byUrl;
  const title = page.title ?? "";
  if (!title) return null;
  const haystack = companyKey(`${page.company ?? ""} ${new URL(page.url).hostname} ${(page.text ?? "").slice(0, 4000)}`);
  let best: { c: T; score: number } | null = null;
  for (const c of candidates) {
    const key = companyKey(c.company);
    if (!key || !haystack.includes(key)) continue; // the company must appear on the page
    const score = titleSimilarity(title, c.title);
    if (score >= 0.6 && (!best || score > best.score)) best = { c, score };
  }
  return best?.c ?? null;
}
