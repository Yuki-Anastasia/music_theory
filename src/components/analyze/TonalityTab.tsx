import KeyTimelineChart from "@/components/KeyTimelineChart";
import FourierTimelineChart from "@/components/FourierTimelineChart";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import type { FourierTimelinePoint } from "@/lib/theory/fourierTimeline";

export interface TonalityTabData {
  keyTimeline: KeyTimelinePoint[];
  fourierTimeline: FourierTimelinePoint[];
  /** Key as notated in a MusicXML score import (null for audio-transcribed songs). */
  notatedKeyText: string | null;
}

export default function TonalityTab({ data }: { data: TonalityTabData }) {
  const { keyTimeline, fourierTimeline, notatedKeyText } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-2 text-lg font-semibold">キーの推移(Krumhansl-Schmuckler)</h2>
        <KeyTimelineChart timeline={keyTimeline} />
        {notatedKeyText && (
          <p className="mt-2 text-xs text-zinc-500">
            記譜された調(推定ではなく楽譜に指定された値): {notatedKeyText}
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-lg font-semibold">フーリエ解析の推移(ピッチクラス集合のDFT)</h2>
        <FourierTimelineChart timeline={fourierTimeline} />
      </div>
    </div>
  );
}
