import PianoRollViewer from "@/components/PianoRollViewer";
import type { NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";

const HISTOGRAM_BAR_MAX_HEIGHT_PX = 128;

export interface OverviewTabData {
  label: string | null;
  events: NormalizedNoteEvent[];
  maxTime: number;
  histogram: number[];
  histogramMax: number;
}

export default function OverviewTab({ data }: { data: OverviewTabData }) {
  const { label, events, maxTime, histogram, histogramMax } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">
          ピアノロール({label}、{events.length}音、{maxTime.toFixed(1)}秒)
        </h2>
        <PianoRollViewer events={events} />
      </div>

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
