export type SummaryStatus = "idle" | "loading" | "done" | "error";

export interface AIExplanationTabData {
  summaryStatus: SummaryStatus;
  summaryText: string | null;
  summaryError: string | null;
  onGenerateSummary: () => void;
}

export default function AIExplanationTab({ data }: { data: AIExplanationTabData }) {
  const { summaryStatus, summaryText, summaryError, onGenerateSummary } = data;

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">AIによる解説</h2>
      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <button
          onClick={onGenerateSummary}
          disabled={summaryStatus === "loading"}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {summaryStatus === "loading" ? "生成中…" : "AIによる解説を生成"}
        </button>

        {summaryStatus === "error" && summaryError && (
          <p className="mt-3 text-sm text-red-500">{summaryError}</p>
        )}

        {summaryStatus === "done" && summaryText && (
          <div className="mt-3">
            <p className="whitespace-pre-wrap text-sm">{summaryText}</p>
            <p className="mt-2 text-xs text-zinc-400">
              Claude(Anthropic)による生成。上記の数値解析結果のみを根拠にしています。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
