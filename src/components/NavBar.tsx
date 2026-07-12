"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "ホーム" },
  { href: "/analyze", label: "曲を解析する" },
  { href: "/live", label: "ライブモード" },
] as const;

/** Shared top nav, present on every page (rendered from layout.tsx). */
export default function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <nav className="mx-auto flex max-w-4xl items-center gap-8 px-8 py-4">
        <Link href="/" className="text-sm tracking-tight text-foreground">
          音楽の数学
        </Link>
        <div className="flex gap-6 text-sm">
          {LINKS.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? "border-b border-navy pb-0.5 text-navy transition-colors"
                    : "border-b border-transparent pb-0.5 text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
