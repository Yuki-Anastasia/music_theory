"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { useLocale, useDict } from "@/lib/i18n/LocaleProvider";
import { commonDict } from "@/lib/i18n/dict/common";
import type { Locale } from "@/lib/i18n/locale";

const LOCALES: { id: Locale; label: string }[] = [
  { id: "ja", label: "日本語" },
  { id: "en", label: "EN" },
];

/** Shared top nav, present on every page (rendered from layout.tsx). */
export default function NavBar() {
  const pathname = usePathname();
  const { locale, setLocale } = useLocale();
  const t = useDict(commonDict);
  const { isSignedIn } = useUser();

  const links = [
    { href: "/", label: t.nav.home },
    { href: "/analyze", label: t.nav.analyze },
    { href: "/live", label: t.nav.live },
    { href: "/about", label: t.nav.about },
  ] as const;

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <nav className="mx-auto flex max-w-4xl items-center gap-8 px-8 py-4">
        <Link href="/" className="text-sm tracking-tight text-foreground">
          {t.brand}
        </Link>
        <div className="flex flex-1 gap-6 text-sm">
          {links.map((link) => {
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
        <div className="flex items-center gap-1 text-xs">
          {LOCALES.map((l) => (
            <button
              key={l.id}
              onClick={() => setLocale(l.id)}
              className={
                locale === l.id
                  ? "rounded-full bg-foreground px-3 py-1 text-background"
                  : "rounded-full px-3 py-1 text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
              }
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          {isSignedIn ? (
            <UserButton />
          ) : (
            <>
              <SignInButton mode="modal">
                <button className="rounded-full px-3 py-1 text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
                  {t.auth.signIn}
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="rounded-full border border-zinc-300 px-3 py-1 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  {t.auth.signUp}
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
