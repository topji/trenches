"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { copy } from "@/lib/copy";

const LINKS = [
  { href: "/seasons", label: copy.nav.trenches, match: (p: string) => p.startsWith("/seasons") || p.startsWith("/t/") },
  { href: "/trenches", label: copy.nav.clans, match: (p: string) => p.startsWith("/trenches") || p.startsWith("/trench/") },
  { href: "/create", label: copy.nav.create, match: (p: string) => p.startsWith("/create") },
  { href: "/dashboard", label: copy.nav.dashboard, match: (p: string) => p.startsWith("/dashboard"), desktopOnly: true },
];

export function NavLinks() {
  const path = usePathname() ?? "";
  return (
    <nav className="flex items-center gap-1 text-small" aria-label="Primary">
      {LINKS.map((l) => {
        const active = l.match(path);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={clsx("h-9 px-3 inline-flex items-center rounded hover:no-underline transition-colors duration-240", active ? "bg-raised text-text" : "text-muted hover:text-text", l.desktopOnly && "hidden sm:inline-flex")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
