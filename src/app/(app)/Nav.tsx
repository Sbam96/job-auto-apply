"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/applications", label: "Applications" },
  { href: "/cv", label: "Master CV" },
  { href: "/profile", label: "Details & answers" },
  { href: "/preferences", label: "Job preferences" },
  { href: "/companies", label: "Companies" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ badge }: { badge: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-canvas hover:text-ink"}`}
          >
            {l.label}
            {l.href === "/applications" && badge > 0 && <span className="ml-2 rounded-full bg-warn-soft px-2 text-xs font-semibold text-warn" title="Waiting for you">{badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
