"use client";

import { useState } from "react";
import SectionHeader from "@/components/analyze/SectionHeader";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { promptAlignmentTabDict } from "@/lib/i18n/dict/promptAlignmentTab";
import type { PromptAlignmentReport } from "@/lib/prompt/scoring";

export type PromptParseStatus = "idle" | "loading" | "done" | "error";

export interface PromptAlignmentTabData {
  prompt: string;
  onChangePrompt: (prompt: string) => void;
  parseStatus: PromptParseStatus;
  parseError: string | null;
  onAnalyze: (prompt: string) => void;
  report: PromptAlignmentReport | null;
}

function percent(value: number): number {
  return Math.round(value * 100);
}

/**
 * Compares a generation prompt's implied musical concepts against this
 * song's actual analysis — every score carries its own confidence and
 * evidence, and a concept with too little evidence is shown as such rather
 * than assigned a number (see src/lib/prompt/scoring.ts).
 */
export default function PromptAlignmentTab({ data }: { data: PromptAlignmentTabData }) {
  const { prompt, onChangePrompt, parseStatus, parseError, onAnalyze, report } = data;
  const t = useDict(promptAlignmentTabDict);
  const [draft, setDraft] = useState(prompt);

  const handleAnalyze = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || parseStatus === "loading") return;
    // Pass the text directly rather than relying on the parent re-rendering
    // with the just-set `prompt` prop first — onChangePrompt's state update
    // wouldn't be visible to onAnalyze's caller until the next render.
    onChangePrompt(trimmed);
    onAnalyze(trimmed);
  };

  return (
    <div>
      <SectionHeader label={t.label} heading={t.heading} description={t.description} />

      <div className="flex flex-col gap-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.placeholder}
          disabled={parseStatus === "loading"}
          rows={3}
          className="w-full rounded-lg border border-zinc-300 bg-transparent px-4 py-3 text-sm disabled:opacity-50 dark:border-zinc-700"
        />
        <div>
          <button
            onClick={handleAnalyze}
            disabled={parseStatus === "loading" || draft.trim().length === 0}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {parseStatus === "loading" ? t.analyzing : t.analyze}
          </button>
        </div>
      </div>

      {parseStatus === "error" && parseError && <p className="mt-3 text-sm text-red-500">{parseError}</p>}

      {!report && parseStatus !== "loading" && (
        <p className="mt-4 text-xs text-zinc-400">{t.emptyHint}</p>
      )}

      {report && (
        <div className="mt-6 flex flex-col gap-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div>
            <p className="text-sm font-semibold">{t.overall.heading}</p>
            {report.overallAlignment !== null ? (
              <p className="mt-1 text-2xl font-semibold">{t.overall.scoreLabel(percent(report.overallAlignment))}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-500">{t.overall.noScoreable}</p>
            )}
            <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-400">{t.caveat}</p>
          </div>

          <div className="flex flex-col gap-4">
            {report.concepts.map((concept, i) => (
              <div
                key={i}
                className={
                  concept.status === "insufficientEvidence"
                    ? "rounded-lg border border-zinc-200 bg-zinc-50 p-4 opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
                    : "rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{concept.concept}</p>
                  <span className="text-xs text-zinc-400">{t.category[concept.category]}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
                  <span>
                    {concept.status === "insufficientEvidence"
                      ? t.status.insufficientEvidence
                      : t.score(percent(concept.score))}
                  </span>
                  <span>{t.coverage(percent(concept.coverage))}</span>
                </div>

                {concept.support.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-zinc-500">{t.support}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-500">
                      {concept.support.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {concept.missing.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-zinc-500">{t.missing}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-zinc-400">
                      {concept.missing.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {concept.contradictions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t.contradictions}</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-amber-700 dark:text-amber-400">
                      {concept.contradictions.map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
