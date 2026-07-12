import PianoRollViewer from "@/components/PianoRollViewer";
import type { NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import type { VoiceSeparation } from "@/lib/theory/voiceSeparation";
import { PITCH_CLASS_NAMES, midiToNoteName } from "@/lib/audio/pitch";

const HISTOGRAM_BAR_MAX_HEIGHT_PX = 128;

export interface OverviewTabData {
  label: string | null;
  events: NormalizedNoteEvent[];
  maxTime: number;
  histogram: number[];
  histogramMax: number;
  /** Note counts per notated part (score imports only); empty for audio-transcribed songs. */
  partComposition: [string, number][];
  /** Skyline-algorithm melody/bass/accompaniment split; null until events exist. */
  voices: VoiceSeparation | null;
}

export default function OverviewTab({ data }: { data: OverviewTabData }) {
  const { label, events, maxTime, histogram, histogramMax, partComposition, voices } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">
          ピアノロール({label}、{events.length}音、{maxTime.toFixed(1)}秒)
        </h2>
        {partComposition.length > 0 && (
          <p className="mb-2 text-xs text-zinc-500">
            パート構成: {partComposition.map(([name, count]) => `${name}(${count}音)`).join("、")}
          </p>
        )}
        <PianoRollViewer events={events} />
      </div>

      {voices && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">抽出されたメロディーライン</h2>
          <p className="mb-3 text-xs text-zinc-500">
            各瞬間で最も高い音をメロディー、最も低い音をベース、残りを伴奏として分類しています(skyline
            algorithm)。この分離結果を、和音進行の検出や予測可能性・自己相似性の計算に使っています。
          </p>
          <div className="rounded-lg border border-zinc-200 p-4 text-xs dark:border-zinc-800">
            <p className="mb-2 text-zinc-500">
              メロディー {voices.melody.length}音 / ベース {voices.bass.length}音 / 伴奏 {voices.accompaniment.length}
              音
            </p>
            <p className="break-words font-mono">
              {voices.melody
                .slice(0, 60)
                .map((e) => midiToNoteName(e.midiNote))
                .join(" → ")}
              {voices.melody.length > 60 && " …"}
            </p>
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 text-lg font-semibold">ピッチクラス・ヒストグラム(鳴っていた時間の合計)</h2>
        <div className="flex items-end gap-1">
          {histogram.map((value, pitchClass) => (
            <div key={pitchClass} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-[#2a78d6] dark:bg-[#3987e5]"
                style={{ height: `${Math.max(2, (value / histogramMax) * HISTOGRAM_BAR_MAX_HEIGHT_PX)}px` }}
              />
              <span className="text-xs text-zinc-500">{PITCH_CLASS_NAMES[pitchClass]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
