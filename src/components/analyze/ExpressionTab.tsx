import MetricCard from "@/components/analyze/MetricCard";
import SectionHeader from "@/components/analyze/SectionHeader";
import MoodQuadrantChart from "@/components/MoodQuadrantChart";
import { describeMoodQuadrant } from "@/lib/theory/emotionEstimate";
import type { TempoEstimate, RhythmicEntropyEstimate } from "@/lib/theory/rhythmAnalysis";
import type { DynamicsSummary } from "@/lib/theory/dynamicsAnalysis";
import type { ArcSection } from "@/lib/theory/songArc";

export interface ExpressionTabData {
  tempo: TempoEstimate | null;
  rhythmEntropy: RhythmicEntropyEstimate | null;
  dynamics: DynamicsSummary | null;
  valence: number | null;
  arousal: number | null;
  arc: ArcSection[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Presents four stages of the same narrative — rhythm, dynamics, mood
 * estimate, then how those measurements evolve across the song — rather
 * than as unrelated dashboard statistics.
 */
export default function ExpressionTab({ data }: { data: ExpressionTabData }) {
  const { tempo, rhythmEntropy, dynamics, valence, arousal, arc } = data;

  return (
    <div className="flex flex-col gap-10">
      {tempo && rhythmEntropy && (
        <div>
          <SectionHeader
            label="EXPRESSION — RHYTHM"
            heading="リズムの推定"
            description="オンセット密度の自己相関からテンポを、音価分布のシャノンエントロピーからリズムの複雑さを推定します。"
          />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <MetricCard
              title="テンポ"
              theory="オンセット密度の自己相関によるビート周期推定"
              formula="argmax_τ r(τ)、bpm = 60 / τ"
              value={`約 ${tempo.bpm} BPM`}
              note={tempo.confidence === "low" ? "確信度低(規則的な拍を検出できず)" : "規則的な拍を検出"}
            />
            <MetricCard
              title="リズムの複雑さ"
              theory="音価分布のシャノンエントロピー"
              formula="H = -Σ p(bucket) log₂ p(bucket)"
              value={`${rhythmEntropy.entropyBits.toFixed(2)} bit (最大 ${rhythmEntropy.maxEntropyBits.toFixed(2)} bit)`}
              note="値が大きいほど音価のバリエーションが豊富"
            />
          </div>
        </div>
      )}

      {dynamics && (
        <div>
          <SectionHeader
            label="EXPRESSION — DYNAMICS"
            heading="強弱の推定"
            description="音符振幅(Basic Pitchのamplitude)の区間平均から、曲全体の強弱とその傾向を推定します。"
          />
          <MetricCard
            title="強弱(ダイナミクス)"
            theory="音符振幅の区間平均"
            formula="range = max(区間平均) - min(区間平均)"
            value={`平均 ${dynamics.averageLoudness.toFixed(2)} / レンジ ${dynamics.dynamicRange.toFixed(2)}`}
            note={
              dynamics.trend === "crescendo"
                ? "だんだん強くなる傾向"
                : dynamics.trend === "diminuendo"
                  ? "だんだん弱くなる傾向"
                  : "おおむね一定"
            }
          />
        </div>
      )}

      {valence !== null && arousal !== null && (
        <div>
          <SectionHeader
            label="EXPRESSION — MOOD"
            heading="感情・印象の推定(Russellの感情円環モデル)"
            description="キー(長調/短調)・協和度・テンポ・強弱・リズムの複雑さから合成した仮説的な推定です。検証済みの感情認識モデルではありません。"
          />
          <MoodQuadrantChart valence={valence} arousal={arousal} />
        </div>
      )}

      {arc.length > 0 && (
        <div>
          <SectionHeader
            label="EXPRESSION — ARC"
            heading="曲の推移"
            description="固定の等分割ではなく、メロディーのピッチクラス分布の変化(novelty検出)から区間の切れ目を検出しています。明確な変化点が無い曲は1区間のままになります。各区間で協和度・強弱・感情推定を再計算し、上の4つの測定値が曲の中でどう動いていくかを見るためのものです。"
          />
          <div className="overflow-x-auto border-y border-zinc-100 dark:border-zinc-900">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="p-3 font-normal"></th>
                  {arc.map((s) => (
                    <th key={s.startSec} className="p-3 font-normal">
                      {formatTime(s.startSec)}-{formatTime(s.endSec)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="p-3 text-zinc-500">協和度(平均Γ)</td>
                  {arc.map((s) => (
                    <td key={s.startSec} className="p-3">
                      {s.consonance.averageGradus.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="p-3 text-zinc-500">強弱(平均音量)</td>
                  {arc.map((s) => (
                    <td key={s.startSec} className="p-3">
                      {s.dynamics.averageLoudness.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 text-zinc-500">感情推定</td>
                  {arc.map((s) => (
                    <td key={s.startSec} className="p-3">
                      {describeMoodQuadrant(s.valence, s.arousal)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
