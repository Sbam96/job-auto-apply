// Render's health check, and a way to wake the free service before a scheduled run.
export function GET() {
  return Response.json({ ok: true });
}
