// Builds a match's CV or cover letter file (DOC-01, DOC-02), for the download link and the extension.
import { coverBlocks, cvBlocks, fileName, toDocx, toPdf } from "./documents";
import type { Db } from "./db";
import { llmFromEnv } from "./llm";
import { freshTailored } from "./refresh";
import { getApplication, getProfile } from "./store";

export const FILE_TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" } as const;

export async function buildDocument(db: Db, userId: string, id: number, doc: "cv" | "cover", format: "pdf" | "docx") {
  const app = await getApplication(db, userId, id);
  if (!app) return null;
  const profile = await getProfile(db, userId);
  const tailored = await freshTailored(db, userId, app, profile, llmFromEnv()); // TL-06
  if (doc === "cover" && !tailored.coverLetter) return null;
  const blocks = doc === "cv" ? cvBlocks(profile, tailored) : coverBlocks(profile, tailored.coverLetter!, app, new Date());
  const title = `${profile.fullName} ${doc === "cv" ? "CV" : "cover letter"}: ${app.title}, ${app.company}`;
  const bytes = format === "pdf" ? await toPdf(blocks, title) : await toDocx(blocks, title);
  await db.query("INSERT INTO events (user_id, application_id, kind, detail) VALUES ($1, $2, 'downloaded', $3)", [userId, id, JSON.stringify({ doc, format })]);
  return { bytes, name: fileName(profile, doc, app.company, format), type: FILE_TYPES[format] };
}
