export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="airmail" aria-hidden />
      <main className="mx-auto grid min-h-[calc(100vh-6px)] max-w-5xl items-center gap-10 px-4 py-12 md:grid-cols-2 md:px-8">
        <div className="hidden md:block">
          <p className="font-display text-5xl font-bold leading-[1.05]">
            Apply further afield, without the copy and paste.
          </p>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted">
            Job Auto-Apply finds remote and international roles you can actually take, tailors your CV honestly for each one, and sends it.
          </p>
        </div>
        <div className="w-full max-w-sm justify-self-center md:justify-self-end">
          <p className="mb-6 font-display text-xl font-bold md:hidden">Job Auto-Apply</p>
          {children}
        </div>
      </main>
    </>
  );
}
