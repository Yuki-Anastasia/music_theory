"use client";

import Link from "next/link";
import HeroNotationMotif from "@/components/decoration/HeroNotationMotif";
import MiniPianoRoll from "@/components/decoration/MiniPianoRoll";
import TonnetzFragment from "@/components/decoration/TonnetzFragment";
import WaveformFragment from "@/components/decoration/WaveformFragment";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { homeDict } from "@/lib/i18n/dict/home";

/** EXPRESSION column's diagram: a function curve annotated with the two formulas it's standing in for. */
function ExpressionDiagram({ className }: { className?: string }) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <WaveformFragment className="h-full w-full" />
      <span className="absolute left-0 top-0 font-mono text-[9px] text-navy">H(X)</span>
      <span className="absolute bottom-0 right-1 font-mono text-[9px] text-navy">r(τ)</span>
    </div>
  );
}

export default function Home() {
  const t = useDict(homeDict);
  const columns = [
    { ...t.columns.tonality, Decoration: MiniPianoRoll },
    { ...t.columns.harmony, Decoration: TonnetzFragment },
    { ...t.columns.expression, Decoration: ExpressionDiagram },
  ];

  return (
    <main className="flex-1">
      <section className="relative mx-auto max-w-5xl overflow-hidden px-8 py-20 lg:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-2/3 text-navy opacity-[0.14] lg:block"
        >
          <HeroNotationMotif className="h-full w-full" />
        </div>

        <div className="relative flex max-w-xl flex-col gap-6">
          <h1 className="text-4xl font-semibold tracking-tight">{t.heading}</h1>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">{t.intro}</p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/analyze"
              className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              {t.analyzeCta}
            </Link>
            <Link
              href="/live"
              className="flex h-12 items-center justify-center rounded-full border border-zinc-300 px-6 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:hover:bg-white/[.06]"
            >
              {t.liveCta}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl grid-cols-1 gap-12 divide-y divide-zinc-200 border-t border-zinc-200 px-8 pb-24 dark:divide-zinc-800 dark:border-zinc-800 sm:grid-cols-3 sm:gap-8 sm:divide-x sm:divide-y-0">
        {columns.map(({ label, heading, body, Decoration }) => (
          <div key={label} className="flex flex-col gap-4 pt-8 first:pt-8 sm:px-8 sm:pt-0 sm:first:pl-0">
            <Decoration className="h-14 w-28 text-navy opacity-40" />
            <div>
              <p className="text-xs font-medium tracking-[0.15em] text-navy">{label}</p>
              <h2 className="mt-1 text-sm font-semibold">{heading}</h2>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">{body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
