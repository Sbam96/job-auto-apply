// DOC-01 and DOC-02: download the tailored CV or cover letter as PDF or Word.
// /applications/12/download?doc=cv&format=pdf   (doc: cv | cover, format: pdf | docx)
import { coverBlocks, cvBlocks, fileName, toDocx, toPdf } from "@/lib/documents";
import { getDb } from "@/lib/db";
import { llmFromEnv } from "@/lib/llm";
import { freshTailored } from "@/lib/refresh";
import { currentUser } from "@/lib/session";
import { getApplication, getProfile } from "@/lib/store";

export const maxDuration = 120;

const TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.verifiedAt) return new Response("Log in first.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const doc = q.get("doc") === "cover" ? "cover" : "cv";
  const format = q.get("format") === "docx" ? "docx" : "pdf";
  const id = Number((await params).id);
  const db = await getDb();
  const app = Number.isInteger(id) ? await getApplication(db, user.id, id) : null;
  if (!app) return new Response("Not found", { status: 404 });
  const profile = await getProfile(db, user.id);
  const tailored = await freshTailored(db, user.id, app, profile, llmFromEnv()); // TL-06
  if (doc === "cover" && !tailored.coverLetter) return new Response("This match has no cover letter.", { status: 404 });

  const blocks = doc === "cv" ? cvBlocks(profile, tailored) : coverBlocks(profile, tailored.coverLetter!, app, new Date());
  const title = `${profile.fullName} ${doc === "cv" ? "CV" : "cover letter"}: ${app.title}, ${app.company}`;
  const bytes = format === "pdf" ? await toPdf(blocks, title) : await toDocx(blocks, title);
  const name = fileName(profile, doc, app.company, format);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'downloaded', $3)", [user.id, id, JSON.stringify({ doc, format })]);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": TYPES[format],
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
