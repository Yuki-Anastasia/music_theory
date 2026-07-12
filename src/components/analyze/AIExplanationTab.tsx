import SectionHeader from "@/components/analyze/SectionHeader";

export type SummaryStatus = "idle" | "loading" | "done" | "error";

export interface AIExplanationTabData {
  summaryStatus: SummaryStatus;
  summaryText: string | null;
  summaryError: string | null;
  onGenerateSummary: () => void;
}

/** A concluding interpretation of the computed analysis above, not the app's central product — an editorial reading, not a chat reply. */
export default function AIExplanationTab({ data }: { data: AIExplanationTabData }) {
  const { summaryStatus, summaryText, summaryError, onGenerateSummary } = data;

  return (
    <div>
      <SectionHeader
        label="READING"
        heading="AIによる解説"
        description="これまでの数値解析結果のみを根拠に、曲の特徴を自然な文章としてまとめた、結論的な解釈です。"
      />
      <button
        onClick={onGenerateSummary}
        disabled={summaryStatus === "loading"}
        className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {summaryStatus === "loading" ? "生成中…" : "AIによる解説を生成"}
      </button>

      {summaryStatus === "error" && summaryError && <p className="mt-3 text-sm text-red-500">{summaryError}</p>}

      {summaryStatus === "done" && summaryText && (
        <div className="mt-6 max-w-xl border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <p className="whitespace-pre-wrap text-sm leading-loose">{summaryText}</p>
          <p className="mt-3 text-xs text-zinc-400">
            Claude(Anthropic)による生成。上記の数値解析結果のみを根拠にしています。
          </p>
        </div>
      )}
    </div>
  );
}
