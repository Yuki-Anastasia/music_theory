import type { ScoreAnalysis } from "./musicXml";
import { estimateTempo } from "../theory/rhythmAnalysis";
import { estimateKeyTimeline } from "../theory/keyTimeline";
import { keyLabel } from "../theory/keyProfile";
import type { Mode } from "../theory/keyProfile";
import type { Locale } from "../i18n/locale";

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

interface ReliableTempo {
  bpm: number;
  /** "notated" (from <sound tempo>/Guitar Pro's tempo field) is trusted outright; "estimated" (onset autocorrelation) is a fallback only used when nothing was notated. */
  source: "notated" | "estimated";
}

/**
 * Prefers the tempo as actually written in the file over re-deriving it
 * from the note pattern — if there's a 表記 (notation), just follow it. Only
 * falls back to estimateTempo (and only when it's "high" confidence) for
 * the rarer case of a MusicXML file with no <sound tempo> at all; Guitar
 * Pro files always have a notated tempo (see buildAnalysisFromMidiEvents),
 * so this fallback path is effectively MusicXML-only. This also sidesteps
 * estimateTempo's known octave-ambiguity failure mode (it can lock onto a
 * tempo/2 or tempo/3 subharmonic for a perfectly regular rhythm), since the
 * notated value has no such ambiguity.
 */
function reliableTempo(analysis: ScoreAnalysis): ReliableTempo | null {
  if (analysis.notatedTempoBpm !== null) {
    return { bpm: analysis.notatedTempoBpm, source: "notated" };
  }
  if (analysis.events.length === 0) return null;
  const estimated = estimateTempo(analysis.events);
  if (estimated.confidence !== "high") return null;
  return { bpm: estimated.bpm, source: "estimated" };
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
const MESSAGES: Record<
  Locale,
  {
    duration: (refName: string, refSec: string, name: string, sec: string) => string;
    tempo: (refName: string, refQualifier: string, refBpm: number, name: string, qualifier: string, bpm: number) => string;
    key: (refName: string, refKey: string, name: string, key: string) => string;
    meter: (refName: string, refMeter: string, name: string, meter: string) => string;
    estimatedQualifier: string;
    notatedQualifier: string;
  }
> = {
  ja: {
    duration: (refName, refSec, name, sec) =>
      `長さの不一致: 「${refName}」(${refSec}秒)と「${name}」(${sec}秒)で長さの差が大きく、同じ曲・同じ区間でない可能性があります。`,
    tempo: (refName, refQualifier, refBpm, name, qualifier, bpm) =>
      `テンポの不一致: 「${refName}」(${refQualifier}約${refBpm}BPM)と「${name}」(${qualifier}約${bpm}BPM)でテンポが大きく異なります。`,
    key: (refName, refKey, name, key) =>
      `調の不一致: 「${refName}」(${refKey})と「${name}」(${key})で調が異なります(移調楽器の記譜など、正当な理由がある場合もあります)。`,
    meter: (refName, refMeter, name, meter) =>
      `拍子の不一致: 「${refName}」(${refMeter})と「${name}」(${meter})で拍子が異なります。`,
    estimatedQualifier: "推定",
    notatedQualifier: "記譜",
  },
  en: {
    duration: (refName, refSec, name, sec) =>
      `Duration mismatch: "${refName}" (${refSec}s) and "${name}" (${sec}s) differ a lot in length — they may not be the same song or section.`,
    tempo: (refName, refQualifier, refBpm, name, qualifier, bpm) =>
      `Tempo mismatch: "${refName}" (${refQualifier} ~${refBpm}BPM) and "${name}" (${qualifier} ~${bpm}BPM) differ significantly in tempo.`,
    key: (refName, refKey, name, key) =>
      `Key mismatch: "${refName}" (${refKey}) and "${name}" (${key}) are in different keys (this can be legitimate, e.g. a transposing instrument's notation).`,
    meter: (refName, refMeter, name, meter) =>
      `Meter mismatch: "${refName}" (${refMeter}) and "${name}" (${meter}) have different time signatures.`,
    estimatedQualifier: "estimated",
    notatedQualifier: "notated",
  },
};

export function checkConsistency(files: FileScoreAnalysis[], locale: Locale = "ja"): ScoreConsistencyWarning[] {
  if (files.length < 2) return [];

  const m = MESSAGES[locale];
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
        message: m.duration(reference.fileName, referenceDuration.toFixed(1), file.fileName, duration.toFixed(1)),
      });
    }
  }

  const referenceTempo = reliableTempo(reference.analysis);
  if (referenceTempo) {
    for (const file of rest) {
      const tempo = reliableTempo(file.analysis);
      if (!tempo) continue;
      if (Math.abs(tempo.bpm - referenceTempo.bpm) > TEMPO_MISMATCH_BPM) {
        const refQualifier = referenceTempo.source === "estimated" ? m.estimatedQualifier : m.notatedQualifier;
        const qualifier = tempo.source === "estimated" ? m.estimatedQualifier : m.notatedQualifier;
        warnings.push({
          type: "tempo",
          message: m.tempo(reference.fileName, refQualifier, referenceTempo.bpm, file.fileName, qualifier, tempo.bpm),
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
          message: m.key(reference.fileName, keyLabel(referenceKey), file.fileName, keyLabel(key)),
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
          message: m.meter(
            reference.fileName,
            `${referenceMeter.numerator}/${referenceMeter.denominator}`,
            file.fileName,
            `${meter.numerator}/${meter.denominator}`
          ),
        });
      }
    }
  }

  return warnings;
}
