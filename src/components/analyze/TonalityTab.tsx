import KeyTimelineChart from "@/components/KeyTimelineChart";
import FourierTimelineChart from "@/components/FourierTimelineChart";
import SectionHeader from "@/components/analyze/SectionHeader";
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
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeader
          label="TONAL STRUCTURE"
          heading="キーの推移"
          description="Krumhansl-Schmucklerアルゴリズムにより、一定時間ごとのピッチクラス分布と24調(12長調+12短調)の相関を計算し、最も近い調を推定します。"
        />
        <KeyTimelineChart timeline={keyTimeline} />
        {notatedKeyText && (
          <p className="mt-2 text-xs text-zinc-500">
            記譜された調(推定ではなく楽譜に指定された値): {notatedKeyText}
          </p>
        )}
      </div>

      <div>
        <SectionHeader
          label="HARMONIC SPECTRUM"
          heading="フーリエ解析の推移"
          description="ピッチクラス集合を12点の離散フーリエ変換にかけ、|X₅|(五度圏上の集中度=ダイアトニック度)を中心に、調性的な特徴の推移を示します。"
        />
        <FourierTimelineChart timeline={fourierTimeline} />
      </div>
    </div>
  );
}
