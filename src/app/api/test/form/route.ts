// Test-only: a job application page shaped like a real Greenhouse form, for the extension tests.
// Only exists when E2E_HOOKS=1. Never set that in production.
export async function GET(req: Request) {
  if (process.env.E2E_HOOKS !== "1") return new Response("Not found", { status: 404 });
  const co = new URL(req.url).searchParams.get("co") ?? "Formco";
  const posting = { "@context": "https://schema.org", "@type": "JobPosting", title: "Business Analyst", hiringOrganization: { "@type": "Organization", name: co }, jobLocationType: "TELECOMMUTE", jobLocation: { address: { addressCountry: "United States" } }, description: "<p>Write user stories in Jira.</p>" };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Business Analyst at ${co}</title>
<script type="application/ld+json">${JSON.stringify(posting)}</script></head><body>
<h1>Business Analyst</h1><p>${co} · Remote, United States</p>
<form onsubmit="event.preventDefault(); document.body.dataset.submitted = '1'">
  <label for="first_name">First Name *</label><input id="first_name" name="first_name" required>
  <label for="last_name">Last Name *</label><input id="last_name" name="last_name" required>
  <label for="email">Email *</label><input id="email" type="email" required>
  <label for="phone">Phone *</label><input id="phone" type="tel" required>
  <label for="resume">Resume/CV *</label><input id="resume" type="file" required>
  <label for="linkedin">LinkedIn Profile</label><input id="linkedin">
  <label for="auth">Are you legally authorized to work in the United States? *</label>
  <select id="auth" required><option>Select...</option><option>Yes</option><option>No</option></select>
  <fieldset><legend>Will you now or in the future require sponsorship? *</legend>
    <label><input type="radio" name="sponsor" value="1" required> Yes</label>
    <label><input type="radio" name="sponsor" value="0" required> No</label>
  </fieldset>
  <label for="gender">Gender</label><select id="gender"><option>Select...</option><option>Male</option><option>Female</option><option>Decline To Self Identify</option></select>
  <label for="why">Why do you want to work at ${co}? *</label><textarea id="why" required></textarea>
  <button type="submit">Submit application</button>
</form></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
