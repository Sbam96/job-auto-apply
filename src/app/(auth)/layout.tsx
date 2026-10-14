import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="airmail" aria-hidden />
      <main className="mx-auto grid min-h-[calc(100vh-6px)] max-w-5xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:px-8">
        <div className="hidden md:block">
          <Link href="/" className="mb-6 block font-display text-xl font-bold hover:text-accent">Job Auto-Apply</Link>
          <p className="font-display text-5xl font-bold leading-[1.05]">
            Apply further afield, with a CV made for every job.
          </p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            Job Auto-Apply finds remote and international roles you can actually take, tailors your CV honestly for each one, and writes a cover letter when it&apos;s needed. You download them and apply.
          </p>
        </div>
        <div className="w-full max-w-sm justify-self-center md:justify-self-end">
          <Link href="/" className="mb-6 block font-display text-xl font-bold hover:text-accent md:hidden">Job Auto-Apply</Link>
          {children}
        </div>
      </main>
    </>
  );
}
