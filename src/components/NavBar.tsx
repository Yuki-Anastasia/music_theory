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
      <nav className="mx-auto flex max-w-3xl items-center gap-6 px-8 py-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          音楽の数学
        </Link>
        <div className="flex gap-4 text-sm">
          {LINKS.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive
                    ? "font-semibold text-[#2a78d6] dark:text-[#3987e5]"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
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
