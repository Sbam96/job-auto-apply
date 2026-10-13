export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-sm font-semibold tracking-wide text-accent">JOB AUTO-APPLY</p>
        {children}
      </div>
    </main>
  );
}
