// DOC-01 and DOC-02: download the tailored CV or cover letter as PDF or Word.
// /applications/12/download?doc=cv&format=pdf   (doc: cv | cover, format: pdf | docx)
import { getDb } from "@/lib/db";
import { buildDocument } from "@/lib/download";
import { currentUser } from "@/lib/session";

export const maxDuration = 120;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user?.verifiedAt) return new Response("Log in first.", { status: 401 });
  const q = new URL(req.url).searchParams;
  const id = Number((await params).id);
  const file = Number.isInteger(id) ? await buildDocument(await getDb(), user.id, id, q.get("doc") === "cover" ? "cover" : "cv", q.get("format") === "docx" ? "docx" : "pdf") : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.bytes), {
    headers: { "Content-Type": file.type, "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "private, no-store" },
  });
}
