// Reads an uploaded CV and returns a draft master CV for the editor (PR-08).
// Nothing is saved to the CV here: the user reviews it and presses Save CV.
// Contact details found in the file fill in any empty Details fields.
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { extractText, MAX_UPLOAD_BYTES, parseCv, splitContact, toMasterCv } from "@/lib/cvimport";
import { getDb } from "@/lib/db";
import { llmFromEnv } from "@/lib/llm";
import { SESSION_COOKIE } from "@/lib/session";
import { getProfile, saveProfile, userForSession } from "@/lib/store";

export const maxDuration = 120;

const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const db = await getDb();
  const user = await userForSession(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!user?.verifiedAt) return fail("Log in first.", 401);
  const form = await req.formData().catch(() => null);
  const file = form?.get("cv");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a CV file to upload.");
  if (file.size > MAX_UPLOAD_BYTES) return fail("That file is over 5 MB. Try a smaller PDF or a Word file.");
  const llm = llmFromEnv();
  if (!llm) return fail("Reading a CV needs the AI key (GEMINI_API_KEY) set in Render.", 503);

  let text: string;
  try {
    text = await extractText(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (err) {
    return fail((err as Error).message);
  }
  if (text.replace(/\s/g, "").length < 200) return fail("Couldn't find text in that file. If it's a scanned image, upload the Word version instead.");

  const { contact, rest } = splitContact(text); // TL-03: contact details stay here
  let draft;
  try {
    draft = toMasterCv(await parseCv(rest, llm), rest, () => randomBytes(5).toString("hex"));
  } catch (err) {
    return fail(`The AI couldn't read the CV this time: ${(err as Error).message}. Try again in a minute.`, 502);
  }

  // Fill empty contact fields only; never overwrite what the user typed.
  const profile = await getProfile(db, user.id);
  const filled: string[] = [];
  const next = { ...profile };
  if (!next.fullName && contact.fullName) { next.fullName = contact.fullName; filled.push("name"); }
  if (!next.phone && contact.phone) { next.phone = contact.phone; filled.push("phone"); }
  if (!next.linkedin && contact.linkedin) { next.linkedin = contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`; filled.push("LinkedIn"); }
  if (!next.portfolio && contact.portfolio) { next.portfolio = contact.portfolio.startsWith("http") ? contact.portfolio : `https://${contact.portfolio}`; filled.push("website"); }
  if (filled.length) await saveProfile(db, user.id, next);

  return Response.json({ cv: draft, filled });
}
