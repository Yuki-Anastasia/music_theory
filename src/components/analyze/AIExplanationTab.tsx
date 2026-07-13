"use client";

import { useState } from "react";
import SectionHeader from "@/components/analyze/SectionHeader";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { aiExplanationTabDict } from "@/lib/i18n/dict/aiExplanationTab";

export type SummaryStatus = "idle" | "loading" | "done" | "error";
export type FollowUpStatus = "idle" | "loading" | "error";

export interface AIExplanationMessage {
  role: "assistant" | "user";
  text: string;
}

export interface AIExplanationTabData {
  summaryStatus: SummaryStatus;
  summaryError: string | null;
  onGenerateSummary: () => void;
  messages: AIExplanationMessage[];
  followUpStatus: FollowUpStatus;
  followUpError: string | null;
  onAskFollowUp: (question: string) => void;
}

/** A concluding interpretation of the computed analysis above, refined through follow-up questions rather than a one-shot reading. */
export default function AIExplanationTab({ data }: { data: AIExplanationTabData }) {
  const { summaryStatus, summaryError, onGenerateSummary, messages, followUpStatus, followUpError, onAskFollowUp } = data;
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
        <button
          onClick={onGenerateSummary}
          disabled={summaryStatus === "loading"}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {summaryStatus === "loading" ? t.generating : t.generate}
        </button>
      )}

      {summaryStatus === "error" && summaryError && <p className="mt-3 text-sm text-red-500">{summaryError}</p>}

      {messages.length > 0 && (
        <div className="mt-6 max-w-xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <div className="flex flex-col gap-4">
            {messages.map((message, i) =>
              message.role === "assistant" ? (
                <p key={i} className="whitespace-pre-wrap text-sm leading-loose">
                  {message.text}
                </p>
              ) : (
                <p key={i} className="text-sm font-medium">
                  <span className="text-zinc-400">{t.userLabel}: </span>
                  {message.text}
                </p>
              )
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-400">{t.footer}</p>

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
