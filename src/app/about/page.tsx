"use client";

import { useDict } from "@/lib/i18n/LocaleProvider";
import { aboutDict } from "@/lib/i18n/dict/about";

export default function AboutPage() {
  const t = useDict(aboutDict);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-10 px-8 py-20">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.heading}</h1>
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.intro}</p>
      </div>

      <div className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">{t.hypothesisHeading}</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.hypothesisBody}</p>
      </div>

      <div className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">{t.aiHeading}</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.aiBody}</p>
      </div>

      <div className="border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <h2 className="text-sm font-semibold">{t.differentiationHeading}</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{t.differentiationBody}</p>
      </div>
    </main>
  );
}
