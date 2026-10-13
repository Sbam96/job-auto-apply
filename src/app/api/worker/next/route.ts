// The laptop worker asks for its next application. It gets the full profile because it is the
// user's own machine filling the user's own forms; this data never goes to the AI.
import { getDb } from "@/lib/db";
import { json, workerUser } from "@/lib/http";
import { cvHtml } from "@/lib/render";
import { getProfile, nextForWorker } from "@/lib/store";

export async function GET(req: Request) {
  const user = await workerUser(req);
  if (!user) return json({ error: "Worker key not recognised. Generate one in Settings." }, 401);
  const mode = new URL(req.url).searchParams.get("mode") === "review" ? "review" : "auto";
  const db = await getDb();
  const app = await nextForWorker(db, user.id, mode);
  if (!app) return json({ application: null });
  const profile = await getProfile(db, user.id);
  return json({
    application: { id: app.id, url: app.url, ats: app.ats, title: app.title, company: app.company, region: app.region, mode: app.mode, countries: app.countries, route: app.route, status: app.status, score: app.score },
    profile,
    coverLetter: app.tailored.coverLetter,
    cvHtml: cvHtml(profile, app.tailored),
  });
}
