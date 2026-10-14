import { logoutAction } from "@/app/actions";
import { getDb } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { dashboardCounts } from "@/lib/store";
import Link from "next/link";
import { Nav } from "./Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = await dashboardCounts(await getDb(), user.id);
  const ready = counts.new ?? 0;
  return (
    <>
      <div className="airmail" aria-hidden />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col md:flex-row">
        <aside className="border-b border-line px-4 py-4 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r md:py-8">
          <Link href="/" className="mb-5 block rounded-lg px-3 font-display text-xl font-bold leading-none hover:text-accent" aria-label="Job Auto-Apply: go to the dashboard">
            Job Auto-Apply
            <span className="mt-1 block text-xs font-normal text-muted">Tailored CVs, ready to send abroad</span>
          </Link>
          <Nav badge={ready} />
          <div className="mt-3 flex items-center justify-between gap-3 px-3 text-xs text-muted md:mt-8 md:block">
            <p className="truncate" title={user.email}>{user.email}</p>
            <form action={logoutAction}><button className="mt-1 font-medium hover:text-ink">Log out</button></form>
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-8 md:px-12 md:py-10">{children}</main>
      </div>
    </>
  );
}
