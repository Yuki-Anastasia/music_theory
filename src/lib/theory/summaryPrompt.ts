import type { KeyTimelinePoint } from "./keyTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { TempoEstimate, RhythmicEntropyEstimate } from "./rhythmAnalysis";
import type { DynamicsSummary } from "./dynamicsAnalysis";
import type { ArcSection } from "./songArc";
import type { MeterAnalysisResult } from "./meterAnalysis";
import type { CounterpointAnalysis, MotionType } from "./counterpoint";
import { keyLabel } from "./keyProfile";
import { chordLabel } from "./tonnetz";
import { describeMoodQuadrant } from "./emotionEstimate";

export interface MoodFacts {
  tempo: TempoEstimate;
  rhythmEntropy: RhythmicEntropyEstimate;
  dynamics: DynamicsSummary;
  valence: number;
  arousal: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function summarizeKeyTimeline(keyTimeline: KeyTimelinePoint[], durationSec: number): string {
  if (keyTimeline.length === 0) return "キー推移: データなし";

  const segments: { start: number; end: number; label: string; lowConfidence: boolean }[] = [];
  for (const point of keyTimeline) {
    const last = segments[segments.length - 1];
    const label = keyLabel(point.key);
    if (last && last.label === label) {
      last.end = point.time;
    } else {
      segments.push({ start: point.time, end: point.time, label, lowConfidence: point.key.confidence === "low" });
    }
  }
  // Extend each segment's end to the start of the next one (or song end for the last).
  for (let i = 0; i < segments.length; i++) {
    segments[i].end = i + 1 < segments.length ? segments[i + 1].start : durationSec;
  }

  const lines = segments.map(
    (s) => `${formatTime(s.start)}-${formatTime(s.end)} ${s.label}${s.lowConfidence ? "(確信度低)" : ""}`
  );
  return `キー推移: ${lines.join(", ")}`;
}

function summarizeTonnetzTrajectory(tonnetzTrajectory: TonnetzTimelinePoint[]): string {
  if (tonnetzTrajectory.length === 0) return "和音進行: データなし";
  const sequence = tonnetzTrajectory.map((p) => chordLabel(p.chord)).join(" → ");
  return `検出された和音の並び: ${sequence}`;
}

/**
 * Consonance and harmonic tension are dropped here since they're already
 * recomputed per-section in summarizeSongArc — restating the whole-song
 * average would just duplicate that data. Predictability/self-similarity
 * have no per-section counterpart, so they stay as whole-song facts.
 */
function summarizeAestheticMetrics(metrics: AestheticMetrics): string {
  const { predictability, selfSimilarity } = metrics;
  return [
    "美しさと相関しうる数理的特徴(証明ではなく仮説的な視点):",
    `- 予測可能性(シャノンの条件付きエントロピーH(Xₙ₊₁|Xₙ)、bit、最大log₂12≈${predictability.maxEntropyBits.toFixed(2)}、値が小さいほど次の音が予測しやすい): ${predictability.conditionalEntropyBits.toFixed(2)}`,
    `- 旋律の自己相似性(自己相関、1に近いほど反復的): ラグ${selfSimilarity.bestLagNotes}音で相関${selfSimilarity.correlation.toFixed(2)}`,
  ].join("\n");
}

const TREND_LABEL: Record<DynamicsSummary["trend"], string> = {
  crescendo: "だんだん強くなる(クレッシェンド傾向)",
  diminuendo: "だんだん弱くなる(ディミヌエンド傾向)",
  stable: "おおむね一定",
};

/**
 * Dynamics trend and the mood quadrant (Russell's circumplex model) are
 * dropped here since summarizeSongArc already gives the per-section version
 * of both — a single whole-song number would flatten exactly the flow the
 * facts are meant to convey. Tempo has no per-section counterpart (arc
 * reuses the whole-song estimate), so it stays here.
 */
function summarizeMood(mood: MoodFacts): string {
  const { tempo, rhythmEntropy } = mood;
  return [
    "テンポ・リズムの推定:",
    `- テンポ: 約${tempo.bpm}BPM${tempo.confidence === "low" ? "(確信度低、規則的な拍を検出できず)" : ""}`,
    `- リズムの複雑さ(音価分布のシャノンエントロピー、bit、最大${rhythmEntropy.maxEntropyBits.toFixed(2)}): ${rhythmEntropy.entropyBits.toFixed(2)}`,
  ].join("\n");
}

/**
 * Per-section (序盤/中盤/終盤 by default) breakdown of consonance, dynamics,
 * and mood — the same whole-song metrics recomputed on time slices, so the
 * facts describe how the song changes rather than a single aggregate.
 */
function summarizeSongArc(sections: ArcSection[]): string {
  if (sections.length === 0) return "曲の推移: データなし";
  const lines = sections.map((s) => {
    const label = describeMoodQuadrant(s.valence, s.arousal);
    return (
      `- ${formatTime(s.startSec)}-${formatTime(s.endSec)}: 協和度平均Γ=${s.consonance.averageGradus.toFixed(2)}、` +
      `強弱平均${s.dynamics.averageLoudness.toFixed(2)}(${TREND_LABEL[s.dynamics.trend]})、` +
      `valence=${s.valence.toFixed(2)}/arousal=${s.arousal.toFixed(2)}(${label})`
    );
  });
  return ["曲の推移(区間ごと、序盤から終盤への変化):", ...lines].join("\n");
}

function summarizeMeter(meter: MeterAnalysisResult): string {
  const meterText = meter.meterSummary.map((p) => `${formatTime(p.time)}〜 ${p.numerator}/${p.denominator}拍子`).join(", ");
  const lines = [
    "拍子・シンコペーション分析(簡易的な指標、Longuet-Higgins & Leeのシンコペーション概念を単純化したもの):",
    `- 拍子: ${meterText}`,
    `- シンコペーション指数: ${meter.syncopation.normalizedScore.toFixed(2)}(0〜1、値が大きいほど強拍を避けて弱拍・裏拍に音を置く傾向)`,
  ];
  if (meter.harmonicRhythmAlignment) {
    const { strongBeatFraction, source } = meter.harmonicRhythmAlignment;
    const sourceLabel = source === "notatedChords" ? "記譜されたコードネーム基準" : "検出された和音基準(粗い推定)";
    lines.push(
      `- 和声変化と拍節の整合(${sourceLabel}): 和音が変わる箇所の${(strongBeatFraction * 100).toFixed(0)}%が強拍/準強拍で起きている`
    );
  }
  return lines.join("\n");
}

const MOTION_LABEL: Record<MotionType, string> = { contrary: "反行", oblique: "斜行", similar: "並行", parallel: "平行" };

/**
 * Only lists pairs with enough overlapping onsets to say anything (a pair
 * with no temporal overlap yields an all-zero row that's not worth
 * narrating) — mirrors how summarizeSongArc silently has nothing to add
 * when its input is empty.
 */
function summarizeCounterpoint(counterpoint: CounterpointAnalysis): string {
  const lines = ["複声部の対位法チェック(古典的な対位法規則、Fuxのspecies counterpointに基づく観点):"];
  for (const pair of counterpoint.pairs) {
    if (pair.verticalityCount <= 1) continue;
    const motionText = (Object.keys(pair.motionPercentages) as MotionType[])
      .map((type) => `${MOTION_LABEL[type]}${pair.motionPercentages[type].toFixed(0)}%`)
      .join("、");
    lines.push(
      `- ${pair.partA} - ${pair.partB}: ${motionText}(平行5度${pair.parallelFifthsCount}回、平行8度${pair.parallelOctavesCount}回検出)`
    );
  }
  return lines.join("\n");
}

/**
 * Builds a compact, rounded, plain-text summary of already-computed analysis
 * facts — no raw arrays, no room for the LLM to invent numbers. This is the
 * only input the /api/summarize route hands to Claude, so the model narrates
 * verified facts rather than guessing.
 *
 * meter/counterpoint are optional and, when omitted or null, contribute
 * nothing to the output — they're only ever available for score-imported
 * input (bar/part data audio transcription doesn't have), so omitting the
 * section entirely avoids implying "checked, found nothing" when actually
 * "this input type has no such data at all".
 */
export function buildAnalysisFacts(
  label: string,
  durationSec: number,
  keyTimeline: KeyTimelinePoint[],
  tonnetzTrajectory: TonnetzTimelinePoint[],
  metrics: AestheticMetrics,
  mood: MoodFacts,
  arc: ArcSection[],
  meter?: MeterAnalysisResult | null,
  counterpoint?: CounterpointAnalysis | null
): string {
  return [
    `曲: ${label}(長さ ${formatTime(durationSec)})`,
    summarizeKeyTimeline(keyTimeline, durationSec),
    summarizeTonnetzTrajectory(tonnetzTrajectory),
    summarizeAestheticMetrics(metrics),
    summarizeMood(mood),
    summarizeSongArc(arc),
    ...(meter ? [summarizeMeter(meter)] : []),
    ...(counterpoint ? [summarizeCounterpoint(counterpoint)] : []),
  ].join("\n");
}
