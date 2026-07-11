import type { KeyTimelinePoint } from "./keyTimeline";
import type { FourierTimelinePoint } from "./fourierTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { InstrumentTagWindow } from "../audio/instrumentTagger";
import { keyLabel } from "./keyProfile";
import { chordLabel } from "./tonnetz";

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

function summarizeFourierTimeline(fourierTimeline: FourierTimelinePoint[]): string {
  if (fourierTimeline.length === 0) return "ダイアトニック度: データなし";

  const x5Values = fourierTimeline.map((p) => p.coefficients.find((c) => c.k === 5)!.normalizedMagnitude);
  const avg = x5Values.reduce((s, v) => s + v, 0) / x5Values.length;
  const min = Math.min(...x5Values);
  const max = Math.max(...x5Values);
  return `ダイアトニック度(|X5|、0-1): 平均${avg.toFixed(2)}、最小${min.toFixed(2)}、最大${max.toFixed(2)}`;
}

function summarizeTonnetzTrajectory(tonnetzTrajectory: TonnetzTimelinePoint[]): string {
  if (tonnetzTrajectory.length === 0) return "和音進行: データなし";
  const sequence = tonnetzTrajectory.map((p) => chordLabel(p.chord)).join(" → ");
  return `検出された和音の並び: ${sequence}`;
}

/**
 * These are named mathematical theories applied to the song's data, not a
 * proof of "beauty" — the facts text says so explicitly so the LLM doesn't
 * overstate what the numbers mean.
 */
function summarizeAestheticMetrics(metrics: AestheticMetrics): string {
  const { consonance, harmonicTension, predictability, selfSimilarity } = metrics;
  return [
    "美しさと相関しうる数理的特徴(証明ではなく仮説的な視点):",
    `- 協和度(オイラーの快さの尺度Gradus Suavitatis、Γ(n)=1+Σaᵢ(pᵢ-1)、値が小さいほど協和的): 平均Γ=${consonance.averageGradus.toFixed(2)}`,
    `- 和声的テンション(声部進行の最小移動距離、半音、値が大きいほど遠い和音への跳躍): 平均${harmonicTension.averageVoiceLeadingDistance.toFixed(2)}、最大${harmonicTension.maxVoiceLeadingDistance.toFixed(2)}`,
    `- 予測可能性(シャノンの条件付きエントロピーH(Xₙ₊₁|Xₙ)、bit、最大log₂12≈${predictability.maxEntropyBits.toFixed(2)}、値が小さいほど次の音が予測しやすい): ${predictability.conditionalEntropyBits.toFixed(2)}`,
    `- 旋律の自己相似性(自己相関、1に近いほど反復的): ラグ${selfSimilarity.bestLagNotes}音で相関${selfSimilarity.correlation.toFixed(2)}`,
  ].join("\n");
}

/**
 * YAMNet is a general-purpose audio tagger over whole time windows, not a
 * per-note instrument separator — the facts text says so explicitly.
 */
function summarizeInstrumentTags(instrumentTags: InstrumentTagWindow[]): string {
  if (instrumentTags.length === 0) return "楽器・声質タグ: データなし";

  const maxScoreByLabel = new Map<string, number>();
  for (const window of instrumentTags) {
    for (const tag of window.tags) {
      const prev = maxScoreByLabel.get(tag.label) ?? 0;
      if (tag.score > prev) maxScoreByLabel.set(tag.label, tag.score);
    }
  }
  const top = [...maxScoreByLabel.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, score]) => `${label}(${Math.round(score * 100)}%)`)
    .join(", ");
  return `楽器・声質タグ(YAMNet、一般音声分類、曲全体での区間ごとの最高確度): ${top}`;
}

/**
 * Builds a compact, rounded, plain-text summary of already-computed analysis
 * facts — no raw arrays, no room for the LLM to invent numbers. This is the
 * only input the /api/summarize route hands to Claude, so the model narrates
 * verified facts rather than guessing.
 */
export function buildAnalysisFacts(
  label: string,
  durationSec: number,
  keyTimeline: KeyTimelinePoint[],
  fourierTimeline: FourierTimelinePoint[],
  tonnetzTrajectory: TonnetzTimelinePoint[],
  metrics: AestheticMetrics,
  instrumentTags: InstrumentTagWindow[]
): string {
  return [
    `曲: ${label}(長さ ${formatTime(durationSec)})`,
    summarizeKeyTimeline(keyTimeline, durationSec),
    summarizeFourierTimeline(fourierTimeline),
    summarizeTonnetzTrajectory(tonnetzTrajectory),
    summarizeAestheticMetrics(metrics),
    summarizeInstrumentTags(instrumentTags),
  ].join("\n");
}
