import PianoRollViewer from "@/components/PianoRollViewer";
import SectionHeader from "@/components/analyze/SectionHeader";
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
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeader
          label="TRANSCRIPTION"
          heading="ピアノロール"
          description="検出された音符を時間とピッチで並べた、この解析の基礎データです。"
        />
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
          <span>{label}</span>
          <span>{events.length}音</span>
          <span>{maxTime.toFixed(1)}秒</span>
          {partComposition.length > 0 && (
            <span>パート構成: {partComposition.map(([name, count]) => `${name}(${count}音)`).join("、")}</span>
          )}
        </div>
        <PianoRollViewer events={events} />
      </div>

      {voices && (
        <div>
          <SectionHeader
            label="VOICE SEPARATION"
            heading="抽出されたメロディーライン"
            description="各瞬間で最も高い音をメロディー、最も低い音をベース、残りを伴奏として分類しています(skyline algorithm)。この分離結果を、和音進行の検出や予測可能性・自己相似性の計算に使っています。"
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
            <span>メロディー {voices.melody.length}音</span>
            <span>ベース {voices.bass.length}音</span>
            <span>伴奏 {voices.accompaniment.length}音</span>
          </div>
          <p className="mt-3 break-words border-l-2 border-zinc-200 pl-4 font-mono text-xs leading-loose tracking-wide text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            {voices.melody
              .slice(0, 60)
              .map((e) => midiToNoteName(e.midiNote))
              .join("  ")}
            {voices.melody.length > 60 && "  …"}
          </p>
        </div>
      )}

      <div>
        <SectionHeader
          label="PITCH-CLASS DISTRIBUTION"
          heading="ピッチクラス・ヒストグラム"
          description="曲全体で各ピッチクラスが鳴っていた時間の合計です。"
        />
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
