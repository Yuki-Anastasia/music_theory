import type { ScoreAnalysis } from "./musicXml";
import { estimateTempo } from "../theory/rhythmAnalysis";
import { estimateKeyTimeline } from "../theory/keyTimeline";
import { keyLabel } from "../theory/keyProfile";
import type { Mode } from "../theory/keyProfile";

// Only warn on a duration gap that's both proportionally large AND not
// trivially small in absolute terms — avoids flagging short excerpts where
// a 1-2s difference is meaningless.
const DURATION_MISMATCH_RELATIVE = 0.15;
const DURATION_MISMATCH_ABSOLUTE_FLOOR_SEC = 2;
const TEMPO_MISMATCH_BPM = 8;

export interface FileScoreAnalysis {
  fileName: string;
  analysis: ScoreAnalysis;
}

export type ConsistencyWarningType = "duration" | "tempo" | "key" | "meter";

export interface ScoreConsistencyWarning {
  type: ConsistencyWarningType;
  message: string;
}

function maxEventTime(analysis: ScoreAnalysis): number {
  return analysis.events.length > 0 ? Math.max(...analysis.events.map((e) => e.time + e.durationSeconds)) : 0;
}

interface ReliableKey {
  tonic: number;
  mode: Mode;
}

/**
 * Prefers the notated key (ground truth, when the score has one) over the
 * estimated key, and only trusts a "high"-confidence estimate — a "low"
 * confidence estimate is too unreliable to use as a consistency signal
 * (would produce noisy false-positive warnings).
 */
function firstReliableKey(analysis: ScoreAnalysis): ReliableKey | null {
  if (analysis.notatedKeyTimeline.length > 0) {
    const first = analysis.notatedKeyTimeline[0];
    return { tonic: first.tonic, mode: first.mode };
  }
  if (analysis.events.length === 0) return null;
  const estimated = estimateKeyTimeline(analysis.events)[0];
  if (!estimated || estimated.key.confidence !== "high") return null;
  return { tonic: estimated.key.tonic, mode: estimated.key.mode };
}

/**
 * Reference-based (first file) consistency checks for multi-file "one
 * instrument per file" uploads meant to be merged into a single combined
 * performance timeline. Each file's parser already outputs absolute
 * seconds, so a merge only lines up correctly if the files really are the
 * same song at the same tempo and starting point — there's no way to
 * auto-correct a misalignment, only to flag when the data looks
 * inconsistent enough that a merge is probably wrong. Deliberately
 * non-blocking (returns warnings, doesn't throw), matching this project's
 * "surface as hypothesis, don't assert" convention used throughout the
 * theory modules (e.g. low-confidence key/tempo estimates are shown, not
 * suppressed).
 */
export function checkConsistency(files: FileScoreAnalysis[]): ScoreConsistencyWarning[] {
  if (files.length < 2) return [];

  const warnings: ScoreConsistencyWarning[] = [];
  const [reference, ...rest] = files;

  const referenceDuration = maxEventTime(reference.analysis);
  for (const file of rest) {
    const duration = maxEventTime(file.analysis);
    const absDiff = Math.abs(duration - referenceDuration);
    const relDiff = referenceDuration > 0 ? absDiff / referenceDuration : 0;
    if (absDiff > DURATION_MISMATCH_ABSOLUTE_FLOOR_SEC && relDiff > DURATION_MISMATCH_RELATIVE) {
      warnings.push({
        type: "duration",
        message: `長さの不一致: 「${reference.fileName}」(${referenceDuration.toFixed(1)}秒)と「${file.fileName}」(${duration.toFixed(1)}秒)で長さの差が大きく、同じ曲・同じ区間でない可能性があります。`,
      });
    }
  }

  const referenceTempo = reference.analysis.events.length > 0 ? estimateTempo(reference.analysis.events) : null;
  if (referenceTempo && referenceTempo.confidence === "high") {
    for (const file of rest) {
      if (file.analysis.events.length === 0) continue;
      const tempo = estimateTempo(file.analysis.events);
      if (tempo.confidence !== "high") continue;
      if (Math.abs(tempo.bpm - referenceTempo.bpm) > TEMPO_MISMATCH_BPM) {
        warnings.push({
          type: "tempo",
          message: `テンポの不一致: 「${reference.fileName}」(約${referenceTempo.bpm}BPM)と「${file.fileName}」(約${tempo.bpm}BPM)で推定テンポが大きく異なります。`,
        });
      }
    }
  }

  const referenceKey = firstReliableKey(reference.analysis);
  if (referenceKey) {
    for (const file of rest) {
      const key = firstReliableKey(file.analysis);
      if (!key) continue;
      if (key.tonic !== referenceKey.tonic || key.mode !== referenceKey.mode) {
        warnings.push({
          type: "key",
          message: `調の不一致: 「${reference.fileName}」(${keyLabel(referenceKey)})と「${file.fileName}」(${keyLabel(key)})で調が異なります(移調楽器の記譜など、正当な理由がある場合もあります)。`,
        });
      }
    }
  }

  const referenceMeter = reference.analysis.meterTimeline[0];
  if (referenceMeter) {
    for (const file of rest) {
      const meter = file.analysis.meterTimeline[0];
      if (!meter) continue;
      if (meter.numerator !== referenceMeter.numerator || meter.denominator !== referenceMeter.denominator) {
        warnings.push({
          type: "meter",
          message: `拍子の不一致: 「${reference.fileName}」(${referenceMeter.numerator}/${referenceMeter.denominator})と「${file.fileName}」(${meter.numerator}/${meter.denominator})で拍子が異なります。`,
        });
      }
    }
  }

  return warnings;
}
