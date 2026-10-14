// EX-01: download the browser extension as a zip, already pointed at this app.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { zipSync } from "fflate";
import { appUrl } from "@/lib/mailer";
import { currentUser } from "@/lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user?.verifiedAt) return new Response("Log in first.", { status: 401 });
  const dir = join(process.cwd(), "extension");
  const files: Record<string, Uint8Array> = {};
  for (const name of await readdir(dir)) {
    let bytes: Uint8Array = await readFile(join(dir, name));
    if (name === "config.js") bytes = new TextEncoder().encode(new TextDecoder().decode(bytes).replace("__APP_URL__", appUrl()));
    files[`job-auto-apply-extension/${name}`] = bytes;
  }
  return new Response(Buffer.from(zipSync(files, { level: 6 })), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="job-auto-apply-extension.zip"', "Cache-Control": "no-store" },
  });
}
