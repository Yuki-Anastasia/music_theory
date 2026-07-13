import type { KeyTimelinePoint } from "./keyTimeline";
import type { FourierTimelinePoint } from "./fourierTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { TempoEstimate, RhythmicEntropyEstimate } from "./rhythmAnalysis";
import type { DynamicsSummary } from "./dynamicsAnalysis";
import type { ArcSection, ClimaxEstimate } from "./songArc";
import type { MeterAnalysisResult } from "./meterAnalysis";
import type { CounterpointAnalysis, MotionType } from "./counterpoint";
import type { NotatedKeyPoint } from "../score/musicXml";
import type { ScoreConsistencyWarning } from "../score/scoreConsistency";
import type { MelodicRange } from "./melodicRange";
import type { ModulationEvent } from "./modulation";
import type { ChordFunctionPoint } from "./chordFunction";
import type { RecurrenceMatch } from "./songForm";
import { collapseKeySegments } from "./keyProfile";
import { chordLabel } from "./tonnetz";
import { describeMoodQuadrant } from "./emotionEstimate";
import { midiToNoteName } from "../audio/pitch";
import { modulationLabel } from "./modulation";

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
  const segments = collapseKeySegments(keyTimeline, durationSec, (p) => p.key, (p) => p.key.confidence === "low");
  const lines = segments.map(
    (s) => `${formatTime(s.start)}-${formatTime(s.end)} ${s.label}${s.flagged ? "(確信度低)" : ""}`
  );
  return `キー推移(推定): ${lines.join(", ")}`;
}

/** Score-only ground truth, distinct from the estimated keyTimeline above — the model may note agreement/disagreement between the two, but isn't required to. */
function summarizeNotatedKey(notatedKeyTimeline: NotatedKeyPoint[], durationSec: number): string {
  const segments = collapseKeySegments(notatedKeyTimeline, durationSec, (p) => p, () => false);
  const lines = segments.map((s) => `${formatTime(s.start)}-${formatTime(s.end)} ${s.label}`);
  return `記譜上の調号(楽譜に実際に記譜された調、推定ではない): ${lines.join(", ")}`;
}

function summarizeFourierTimeline(fourierTimeline: FourierTimelinePoint[]): string {
  if (fourierTimeline.length === 0) return "ダイアトニック度: データなし";
  const x5Values = fourierTimeline.map((p) => p.coefficients.find((c) => c.k === 5)?.normalizedMagnitude ?? 0);
  const avg = x5Values.reduce((s, v) => s + v, 0) / x5Values.length;
  return (
    `ダイアトニック度(調性らしさ、フーリエ係数|X5|の正規化値、0-1、高いほど長短音階に近い): ` +
    `平均${avg.toFixed(2)}、最小${Math.min(...x5Values).toFixed(2)}、最大${Math.max(...x5Values).toFixed(2)}`
  );
}

function summarizeTonnetzTrajectory(tonnetzTrajectory: TonnetzTimelinePoint[]): string {
  if (tonnetzTrajectory.length === 0) return "和音進行: データなし";
  const sequence = tonnetzTrajectory.map((p) => chordLabel(p.chord)).join(" → ");
  return `検出された和音の並び: ${sequence}`;
}

/** Discrete key-change pivot points, distinct from the continuous keyTimeline above. */
function summarizeModulations(modulations: ModulationEvent[]): string {
  const RELATIONSHIP_LABEL: Record<ModulationEvent["relationship"], string> = {
    relativeMajorMinor: "平行調",
    parallelMajorMinor: "同主調",
    dominant: "属調",
    subdominant: "下属調",
    other: "その他の関係",
  };
  const lines = modulations.map(
    (m) =>
      `- ${formatTime(m.time)}: ${modulationLabel(m)}(${RELATIONSHIP_LABEL[m.relationship]})${m.lowConfidence ? "(確信度低)" : ""}`
  );
  return ["転調(調の推定タイムラインから検出した離散的な転換点):", ...lines].join("\n");
}

function summarizeChordFunctions(chordFunctions: ChordFunctionPoint[]): string {
  const sequence = chordFunctions.map((p) => p.romanNumeral).join(" → ");
  return (
    "検出された和音の機能(その時点の推定キーに対するローマ数字表記、簡易的な指標。" +
    `長三和音・短三和音の区別のみに基づくため減三和音等は区別されない): ${sequence}`
  );
}

function summarizeScoreWarnings(scoreWarnings: ScoreConsistencyWarning[]): string {
  const lines = scoreWarnings.map((w) => `- ${w.message}`);
  return ["複数ファイルの結合における整合性の警告(自動検出):", ...lines].join("\n");
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

function summarizeMelodicRange(range: MelodicRange): string {
  return (
    `旋律の音域: 最低${midiToNoteName(range.minMidi)}、最高${midiToNoteName(range.maxMidi)}` +
    `(${range.rangeSemitones}半音)、平均音高${midiToNoteName(Math.round(range.meanMidi))}`
  );
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
    `- テンポ: 約${tempo.bpm}BPM${
      tempo.source === "notated"
        ? "(楽譜に記譜された値)"
        : tempo.confidence === "low"
          ? "(確信度低、規則的な拍を検出できず)"
          : ""
    }`,
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

function summarizeClimax(climax: ClimaxEstimate): string {
  return (
    `山場の仮説(強弱・和声的テンション・覚醒度を組み合わせた指標が最大となる区間): ` +
    `第${climax.sectionIndex + 1}区間(${formatTime(climax.startSec)}-${formatTime(climax.endSec)})`
  );
}

function summarizeSongForm(recurrence: RecurrenceMatch): string {
  return (
    `曲の構成の仮説: ${formatTime(recurrence.a.startSec)}-${formatTime(recurrence.a.endSec)}の音使いが` +
    `${formatTime(recurrence.b.startSec)}-${formatTime(recurrence.b.endSec)}にも類似度${recurrence.similarity.toFixed(2)}で再登場しており、` +
    "同じセクションの繰り返しである可能性があります"
  );
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
 * Whenever the input came from a score/tab with identifiable instrument
 * parts, the model is told explicitly which one(s) the analysis covers —
 * whether that's every part (the default) or a subset the user narrowed
 * down with PartSelector in the UI. Without this, the model narrates "the
 * song" as if describing the whole ensemble when the numbers might only
 * reflect e.g. the guitar part alone. Omitted entirely for audio-
 * transcribed input, which has no part data at all.
 */
function summarizeIncludedParts(includedParts: string[]): string {
  return `解析対象パート: ${includedParts.join("、")}(この曲のうち、上記のパートのみを対象に解析しています)`;
}

export interface AnalysisFactsInput {
  label: string;
  durationSec: number;
  keyTimeline: KeyTimelinePoint[];
  fourierTimeline: FourierTimelinePoint[];
  tonnetzTrajectory: TonnetzTimelinePoint[];
  metrics: AestheticMetrics;
  mood: MoodFacts;
  arc: ArcSection[];
  meter?: MeterAnalysisResult | null;
  counterpoint?: CounterpointAnalysis | null;
  includedParts?: string[];
  notatedKeyTimeline?: NotatedKeyPoint[];
  scoreWarnings?: ScoreConsistencyWarning[];
  melodicRange?: MelodicRange | null;
  climax?: ClimaxEstimate | null;
  modulations?: ModulationEvent[];
  chordFunctions?: ChordFunctionPoint[];
  songForm?: RecurrenceMatch | null;
}

/**
 * Builds a compact, rounded, plain-text summary of already-computed analysis
 * facts — no raw arrays, no room for the LLM to invent numbers. This is the
 * only input the /api/summarize route hands to Claude, so the model narrates
 * verified facts rather than guessing.
 *
 * Every optional field is omitted entirely (not "checked, found nothing")
 * when absent/empty/null — most of them are score-import-only or depend on
 * enough signal to say anything (e.g. a climax needs >= 2 arc sections), so
 * omission means "not applicable to this input", not "nothing found".
 */
export function buildAnalysisFacts(input: AnalysisFactsInput): string {
  const {
    label, durationSec, keyTimeline, fourierTimeline, tonnetzTrajectory, metrics, mood, arc,
    meter, counterpoint, includedParts, notatedKeyTimeline, scoreWarnings, melodicRange,
    climax, modulations, chordFunctions, songForm,
  } = input;

  return [
    `曲: ${label}(長さ ${formatTime(durationSec)})`,
    ...(includedParts && includedParts.length > 0 ? [summarizeIncludedParts(includedParts)] : []),
    ...(scoreWarnings && scoreWarnings.length > 0 ? [summarizeScoreWarnings(scoreWarnings)] : []),
    ...(notatedKeyTimeline && notatedKeyTimeline.length > 0 ? [summarizeNotatedKey(notatedKeyTimeline, durationSec)] : []),
    summarizeKeyTimeline(keyTimeline, durationSec),
    ...(modulations && modulations.length > 0 ? [summarizeModulations(modulations)] : []),
    summarizeFourierTimeline(fourierTimeline),
    summarizeTonnetzTrajectory(tonnetzTrajectory),
    ...(chordFunctions && chordFunctions.length > 0 ? [summarizeChordFunctions(chordFunctions)] : []),
    summarizeAestheticMetrics(metrics),
    ...(melodicRange ? [summarizeMelodicRange(melodicRange)] : []),
    summarizeMood(mood),
    summarizeSongArc(arc),
    ...(climax ? [summarizeClimax(climax)] : []),
    ...(songForm ? [summarizeSongForm(songForm)] : []),
    ...(meter ? [summarizeMeter(meter)] : []),
    ...(counterpoint ? [summarizeCounterpoint(counterpoint)] : []),
  ].join("\n");
}
