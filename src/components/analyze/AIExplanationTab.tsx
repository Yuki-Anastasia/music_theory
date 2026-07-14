"use client";

import { useState } from "react";
import SectionHeader from "@/components/analyze/SectionHeader";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { aiExplanationTabDict } from "@/lib/i18n/dict/aiExplanationTab";
import type { ExplanationLevel } from "@/lib/explanationLevel";

export type SummaryStatus = "idle" | "loading" | "done" | "error";
export type FollowUpStatus = "idle" | "loading" | "error";

export interface AIExplanationMessage {
  role: "assistant" | "user";
  text: string;
  /** A synthesized (not model-authored) summary of any score edits applied alongside this message — see scoreEdits.ts. */
  changeLog?: string;
}

export interface AIExplanationTabData {
  summaryStatus: SummaryStatus;
  summaryError: string | null;
  onGenerateSummary: () => void;
  messages: AIExplanationMessage[];
  followUpStatus: FollowUpStatus;
  followUpError: string | null;
  onAskFollowUp: (question: string) => void;
  explanationLevel: ExplanationLevel;
  onChangeExplanationLevel: (level: ExplanationLevel) => void;
  canUndoEdit: boolean;
  onUndoEdit: () => void;
}

const LEVELS: ExplanationLevel[] = ["beginner", "professional"];

/** A concluding interpretation of the computed analysis above, refined through follow-up questions rather than a one-shot reading. */
export default function AIExplanationTab({ data }: { data: AIExplanationTabData }) {
  const {
    summaryStatus,
    summaryError,
    onGenerateSummary,
    messages,
    followUpStatus,
    followUpError,
    onAskFollowUp,
    explanationLevel,
    onChangeExplanationLevel,
    canUndoEdit,
    onUndoEdit,
  } = data;
  const t = useDict(aiExplanationTabDict);
  const [question, setQuestion] = useState("");

  const handleSend = () => {
    const trimmed = question.trim();
    if (!trimmed || followUpStatus === "loading") return;
    onAskFollowUp(trimmed);
    setQuestion("");
  };

  return (
    <div>
      <SectionHeader label={t.label} heading={t.heading} description={t.description} />
      {messages.length === 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={onGenerateSummary}
            disabled={summaryStatus === "loading"}
            className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {summaryStatus === "loading" ? t.generating : t.generate}
          </button>
          <div className="flex gap-1 text-xs">
            {LEVELS.map((level) => (
              <button
                key={level}
                onClick={() => onChangeExplanationLevel(level)}
                disabled={summaryStatus === "loading"}
                className={
                  explanationLevel === level
                    ? "rounded-full bg-foreground px-3 py-1 text-background"
                    : "rounded-full border border-zinc-300 px-3 py-1 text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:hover:text-zinc-100"
                }
              >
                {t.level[level]}
              </button>
            ))}
          </div>
        </div>
      )}

      {summaryStatus === "error" && summaryError && <p className="mt-3 text-sm text-red-500">{summaryError}</p>}

      {messages.length > 0 && (
        <div className="mt-6 max-w-xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex flex-col gap-4">
            {messages.map((message, i) =>
              message.role === "assistant" ? (
                <div key={i}>
                  <p className="whitespace-pre-wrap text-sm leading-loose">{message.text}</p>
                  {message.changeLog && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-zinc-400">{message.changeLog}</p>
                  )}
                </div>
              ) : (
                <p key={i} className="text-sm font-medium">
                  <span className="text-zinc-400">{t.userLabel}: </span>
                  {message.text}
                </p>
              )
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-400">{t.footer}</p>

          {canUndoEdit && (
            <button
              onClick={onUndoEdit}
              className="mt-3 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 dark:border-zinc-700 dark:hover:text-zinc-100"
            >
              {t.undoEdit}
            </button>
          )}

          {followUpStatus === "error" && followUpError && <p className="mt-3 text-sm text-red-500">{followUpError}</p>}

          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              disabled={followUpStatus === "loading"}
              placeholder={t.askPlaceholder}
              className="flex-1 rounded-full border border-zinc-300 bg-transparent px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
            />
            <button
              onClick={handleSend}
              disabled={followUpStatus === "loading" || question.trim().length === 0}
              className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {followUpStatus === "loading" ? t.sending : t.send}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
