// Saved samples in the shapes each API returns (checked against the live APIs on 13 Oct 2026).

export const greenhouse = {
  jobs: [
    {
      id: 101, title: "Business Analyst", location: { name: "Home based - EMEA" },
      absolute_url: "https://job-boards.greenhouse.io/acme/jobs/101",
      content: "&lt;p&gt;Write &lt;strong&gt;user stories&lt;/strong&gt; in Jira &amp;amp; run SQL.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Agile&lt;/li&gt;&lt;/ul&gt;",
      updated_at: "2026-10-10T10:00:00Z", first_published: "2026-10-09T10:00:00Z", company_name: "Acme", metadata: null,
    },
    { id: 102, title: "Account Executive - France", location: { name: "Remote, France" }, absolute_url: "https://job-boards.greenhouse.io/acme/jobs/102", content: "Sell things", updated_at: "2026-10-10T10:00:00Z" },
  ],
};

export const lever = [
  {
    id: "abc-123", text: "Senior Business Analyst", hostedUrl: "https://jobs.lever.co/beta/abc-123", applyUrl: "https://jobs.lever.co/beta/abc-123/apply",
    descriptionPlain: "Join our insurance team.", additionalPlain: "Benefits galore.",
    lists: [{ text: "What you'll do", content: "<li>Gather requirements</li><li>Run workshops</li>" }],
    categories: { location: "New York, NY", commitment: "Full-time", team: "Ops", allLocations: ["New York, NY", "Remote - US"] },
    workplaceType: "remote", salaryRange: { min: 110000, max: 140000, currency: "USD", interval: "per-year-salary" }, createdAt: 1760000000000,
  },
];

export const ashby = {
  apiVersion: "1",
  jobs: [
    {
      id: "a1", title: "Product Analyst", location: "Remote (EMEA)", secondaryLocations: [{ location: "London" }], employmentType: "FullTime",
      isListed: true, isRemote: true, workplaceType: "Remote", jobUrl: "https://jobs.ashbyhq.com/gamma/a1", applyUrl: "https://jobs.ashbyhq.com/gamma/a1/application",
      descriptionPlain: "Analyse product data with SQL.", publishedAt: "2026-10-11T09:00:00Z",
      compensation: { summaryComponents: [{ compensationType: "Salary", minValue: 55000, maxValue: 70000, currencyCode: "GBP", interval: "1 YEAR" }] },
    },
    { id: "a2", title: "Hidden role", isListed: false, jobUrl: "https://jobs.ashbyhq.com/gamma/a2" },
  ],
};

export const remotive = {
  "job-count": 1,
  jobs: [
    {
      id: 9001, url: "https://remotive.com/remote-jobs/business/business-analyst-9001", title: "Business Analyst", company_name: "Delta",
      category: "Business", job_type: "contract", publication_date: "2026-10-12T08:00:00", candidate_required_location: "USA",
      salary: "$90k - $120k", description: "<p>Requirements gathering &amp; stakeholder management.</p>",
    },
  ],
};

// A tiny fake network keyed by URL prefix.
export function fakeFetch(routes: Record<string, unknown | Error>) {
  const calls: string[] = [];
  const impl = (async (url: string) => {
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.startsWith(k));
    if (!key) return new Response("not found", { status: 404 });
    const v = routes[key];
    if (v instanceof Error) throw v;
    return new Response(JSON.stringify(v), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
  return { impl, calls };
}
