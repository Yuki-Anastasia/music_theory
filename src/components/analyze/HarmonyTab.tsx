import TonnetzView from "@/components/TonnetzView";
import MetricCard from "@/components/analyze/MetricCard";
import SectionHeader from "@/components/analyze/SectionHeader";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import type { AestheticMetrics, ConsonanceEstimate, PredictabilityEstimate } from "@/lib/theory/aestheticMetrics";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";

export interface HarmonyTabData {
  tonnetzTrajectory: TonnetzTimelinePoint[];
  aestheticMetrics: AestheticMetrics | null;
  markovSequence: number[] | null;
  markovMetrics: { consonance: ConsonanceEstimate; predictability: PredictabilityEstimate } | null;
  onGenerateMarkov: () => void;
  /** Chord names as notated in a MusicXML score import (null for audio-transcribed songs). */
  notatedChordText: string | null;
}

export default function HarmonyTab({ data }: { data: HarmonyTabData }) {
  const { tonnetzTrajectory, aestheticMetrics, markovSequence, markovMetrics, onGenerateMarkov, notatedChordText } =
    data;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeader
          label="HARMONIC GEOMETRY"
          heading="Tonnetz軌跡"
          description="Eulerの音格子(Tonnetz)上で、検出された和音の進行を軌跡として描きます。隣接する三角形は共通音を1〜2音共有する、声部移動の小さい和音同士です。"
        />
        <TonnetzView trajectory={tonnetzTrajectory} />
        {notatedChordText && (
          <p className="mt-2 break-words text-xs text-zinc-500">
            記譜されたコード進行(楽譜のコードネーム表記): {notatedChordText}
          </p>
        )}
      </div>

      {aestheticMetrics && (
        <div>
          <SectionHeader
            label="STRUCTURAL METRICS"
            heading="美しさと相関しうる数理的特徴"
            description="これらは「美しさの証明」ではありません。音楽理論・情報理論上の名前のついた指標との、数学的な相関を示す仮説的な視点です。"
          />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <MetricCard
              title="協和度"
              theory="オイラーの快さの尺度 (Gradus Suavitatis, 1739)"
              formula="Γ(n) = 1 + Σ aᵢ(pᵢ - 1)"
              value={`平均 Γ = ${aestheticMetrics.consonance.averageGradus.toFixed(2)}`}
              note="値が小さいほど協和的(完全五度Γ=4、短二度Γ=11)"
            />
            <MetricCard
              title="和声的テンション"
              theory="声部進行の最小移動距離 (Neo-Riemannian理論)"
              formula="min Σᵢ dist(aᵢ, b_perm(i))"
              value={`平均 ${aestheticMetrics.harmonicTension.averageVoiceLeadingDistance.toFixed(2)}半音 / 最大 ${aestheticMetrics.harmonicTension.maxVoiceLeadingDistance.toFixed(2)}半音`}
              note="値が大きいほど、遠い和音への跳躍"
            />
            <MetricCard
              title="予測可能性"
              theory="シャノンの条件付きエントロピー (情報理論, 1948)"
              formula="H(Xₙ₊₁|Xₙ) = -Σ p(a,b)log₂p(b|a)"
              value={`${aestheticMetrics.predictability.conditionalEntropyBits.toFixed(2)} bit (最大 ${aestheticMetrics.predictability.maxEntropyBits.toFixed(2)} bit)`}
              note="値が小さいほど、次の音が予測しやすい"
            />
            <MetricCard
              title="旋律の自己相似性"
              theory="自己相関によるモチーフ検出"
              formula="r(τ) = Σ(x[n]-μ)(x[n+τ]-μ) / Σ(x[n]-μ)²"
              value={`ラグ${aestheticMetrics.selfSimilarity.bestLagNotes}音で相関 ${aestheticMetrics.selfSimilarity.correlation.toFixed(2)}`}
              note="1に近いほど、その間隔で旋律が反復"
            />
          </div>
        </div>
      )}

      <div>
        <SectionHeader
          label="GENERATIVE MODEL"
          heading="アルゴリズムによる生成(1次マルコフ連鎖)"
          description="曲中のピッチクラス遷移確率(上の「予測可能性」と同じ行列)から、次の音を確率的にサンプリングして新しい音列を生成します。元の曲を作曲したアルゴリズムの再現ではなく、統計的性質を近似する単純な1次マルコフモデルによる生成です。"
        />
        <button
          onClick={onGenerateMarkov}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
        >
          生成する
        </button>

        {markovSequence && (
          <div className="mt-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
            <p className="break-words font-mono text-xs leading-loose tracking-wide">
              {markovSequence.map((pc) => PITCH_CLASS_NAMES[pc]).join("  ")}
            </p>
            {markovMetrics && aestheticMetrics && (
              <table className="mt-3 text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="pb-1 pr-4 font-normal"></th>
                    <th className="pb-1 pr-4 font-normal">元の曲</th>
                    <th className="pb-1 font-normal">生成列</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-4 text-zinc-500">協和度(平均Γ)</td>
                    <td className="pr-4">{aestheticMetrics.consonance.averageGradus.toFixed(2)}</td>
                    <td>{markovMetrics.consonance.averageGradus.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-zinc-500">予測可能性(bit)</td>
                    <td className="pr-4">{aestheticMetrics.predictability.conditionalEntropyBits.toFixed(2)}</td>
                    <td>{markovMetrics.predictability.conditionalEntropyBits.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
