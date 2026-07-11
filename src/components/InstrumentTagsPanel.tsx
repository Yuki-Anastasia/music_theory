import { InstrumentTagWindow } from "@/lib/audio/instrumentTagger";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Per-time-window top tags from YAMNet (AudioSet's 521-class general audio
 * tagger) — a coarse, whole-mixture estimate of what kinds of sound are
 * present, not a per-note instrument separation.
 */
export default function InstrumentTagsPanel({ windows }: { windows: InstrumentTagWindow[] }) {
  if (windows.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold">楽器・声質の推定(YAMNet)</h2>
      <p className="mb-3 text-xs text-zinc-500">
        一般音声分類モデル(YAMNet, AudioSetの521クラス)による、曲全体の音の混合に対する粗い推定です。
        どの音符がどの楽器かを分離するものではありません。
      </p>
      <div className="flex flex-col divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {windows.map((window) => (
          <div key={window.time} className="flex items-center gap-4 p-3">
            <span className="w-12 shrink-0 text-xs text-zinc-500">{formatTime(window.time)}</span>
            <div className="flex flex-1 flex-wrap gap-x-4 gap-y-2">
              {window.tags.map((tag) => (
                <div key={tag.label} className="flex items-center gap-2">
                  <span className="text-sm">{tag.label}</span>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]"
                      style={{ width: `${Math.round(tag.score * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">{Math.round(tag.score * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
