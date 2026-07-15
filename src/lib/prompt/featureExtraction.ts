import type { TempoEstimate, RhythmicEntropyEstimate } from "../theory/rhythmAnalysis";
import type { DynamicsSummary } from "../theory/dynamicsAnalysis";
import type { AestheticMetrics } from "../theory/aestheticMetrics";
import type { ScaleFitEstimate } from "../theory/pitchClassProfile";
import type { SongFormResult } from "../theory/songForm";
import type { ClimaxEstimate } from "../theory/songArc";
import type { MeterAnalysisResult } from "../theory/meterAnalysis";
import type { InstrumentBuildUp } from "../theory/instrumentDensity";
import type { TonnetzTimelinePoint } from "../theory/tonnetzTimeline";
import { estimateKey } from "../theory/keyProfile";
import { diatonicity } from "../theory/fourierAnalysis";
import type { FeatureName } from "./ontology";
import type { FeatureSampleMap } from "./featureSample";

// Tunable MVP defaults for the "data sufficiency" confidence fallback used by
// features with no native detection-confidence signal upstream (see the q(f)
// sourcing table in the plan / docs/SPEC.md) — not validated constants.
const MIN_NOTES_FOR_FULL_CONFIDENCE = 50;
const MIN_SYNCOPATION_PAIRS_FOR_FULL_CONFIDENCE = 20;
const MIN_FORM_WINDOWS_FOR_FULL_CONFIDENCE = 5;
const MIN_ARC_SECTIONS_FOR_FULL_CONFIDENCE = 4;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function dataSufficiency(noteCount: number): number {
  return clamp01(noteCount / MIN_NOTES_FOR_FULL_CONFIDENCE);
}

export interface PromptAlignmentInput {
  tempo: TempoEstimate | null;
  rhythmEntropy: RhythmicEntropyEstimate | null;
  dynamics: DynamicsSummary | null;
  valence: number | null;
  arousal: number | null;
  aestheticMetrics: AestheticMetrics | null;
  scaleFit: ScaleFitEstimate | null;
  songForm: SongFormResult | null;
  climax: ClimaxEstimate | null;
  /** Number of arc sections the climax (if any) was chosen among — used only to scale climax-related confidence, not the value itself. */
  arcSectionCount: number;
  /** Score-import-only; null for audio-transcribed input (see meterAnalysis.ts). */
  meter: MeterAnalysisResult | null;
  /** Score-import-only; null for audio-transcribed input (see instrumentDensity.ts). */
  instrumentBuildUp: InstrumentBuildUp | null;
  /** Distinct notated part/instrument names (e.g. scorePartNames in analyze/page.tsx) — empty for audio-transcribed input, which has no per-instrument identity at all. */
  partLabels: string[];
  tonnetzTrajectory: TonnetzTimelinePoint[];
  histogram: number[];
  maxTime: number;
  noteCount: number;
}

/** Stable quadrant key mirroring emotionEstimate.ts's describeMoodQuadrant branching, without its localized prose. */
function moodQuadrantKey(valence: number, arousal: number): "excited" | "tense" | "sad" | "calm" {
  if (valence >= 0 && arousal >= 0) return "excited";
  if (valence < 0 && arousal >= 0) return "tense";
  if (valence < 0 && arousal < 0) return "sad";
  return "calm";
}

/**
 * Packages already-computed analysis (from src/lib/theory/*) into
 * per-feature samples for prompt-concept matching — no new analysis math.
 * A feature is simply omitted from the map when its upstream input is
 * null/unusable, never defaulted to a guess; this is also how "no real
 * audio instrument/timbre classifier exists" resolves itself for free —
 * instrumentTextureBuildUp and syncopation are score-import-only upstream
 * (see instrumentDensity.ts/meterAnalysis.ts), so audio-transcribed input
 * naturally omits them here, which scoring.ts's coverage math then reports
 * as insufficient evidence rather than a fabricated score.
 */
export function buildFeatureSamples(input: PromptAlignmentInput): FeatureSampleMap {
  const samples: FeatureSampleMap = {};

  if (input.tempo) {
    const q = input.tempo.source === "notated" ? 1 : clamp01(input.tempo.rawCorrelation ?? 0);
    samples.tempoBpm = {
      feature: "tempoBpm",
      value: input.tempo.bpm,
      q,
      evidence:
        input.tempo.source === "notated"
          ? `${input.tempo.bpm} BPM (notated)`
          : `${input.tempo.bpm} BPM (estimated, autocorrelation r=${(input.tempo.rawCorrelation ?? 0).toFixed(2)})`,
    };
  }

  if (input.rhythmEntropy) {
    const value = input.rhythmEntropy.maxEntropyBits > 0 ? input.rhythmEntropy.entropyBits / input.rhythmEntropy.maxEntropyBits : 0;
    samples.rhythmicComplexity = {
      feature: "rhythmicComplexity",
      value,
      q: dataSufficiency(input.noteCount),
      evidence: `rhythmic entropy ${input.rhythmEntropy.entropyBits.toFixed(2)}/${input.rhythmEntropy.maxEntropyBits.toFixed(2)} bits`,
    };
  }

  if (input.meter) {
    samples.syncopation = {
      feature: "syncopation",
      value: input.meter.syncopation.normalizedScore,
      q: clamp01(input.meter.syncopation.pairCount / MIN_SYNCOPATION_PAIRS_FOR_FULL_CONFIDENCE),
      evidence: `syncopation score ${input.meter.syncopation.normalizedScore.toFixed(2)} (${input.meter.syncopation.pairCount} onset pairs)`,
    };
  }

  if (input.dynamics) {
    const q = dataSufficiency(input.noteCount);
    samples.dynamicRange = {
      feature: "dynamicRange",
      value: input.dynamics.dynamicRange,
      q,
      evidence: `${input.dynamics.dynamicRange.toFixed(2)}`,
    };
    samples.averageLoudness = {
      feature: "averageLoudness",
      value: input.dynamics.averageLoudness,
      q,
      evidence: `${input.dynamics.averageLoudness.toFixed(2)}`,
    };
    samples.dynamicsTrend = {
      feature: "dynamicsTrend",
      value: input.dynamics.trend,
      q,
      evidence: input.dynamics.trend,
    };
  }

  if (input.arousal !== null) {
    samples.arousal = {
      feature: "arousal",
      value: input.arousal,
      q: dataSufficiency(input.noteCount),
      evidence: `${input.arousal.toFixed(2)}`,
    };
  }

  if (input.valence !== null) {
    samples.valence = {
      feature: "valence",
      value: input.valence,
      q: dataSufficiency(input.noteCount),
      evidence: `${input.valence.toFixed(2)}`,
    };
  }

  if (input.valence !== null && input.arousal !== null) {
    const quadrant = moodQuadrantKey(input.valence, input.arousal);
    samples.moodQuadrant = {
      feature: "moodQuadrant",
      value: quadrant,
      q: dataSufficiency(input.noteCount),
      evidence: `${quadrant} (valence ${input.valence.toFixed(2)}, arousal ${input.arousal.toFixed(2)})`,
    };
  }

  if (input.aestheticMetrics) {
    const q = dataSufficiency(input.noteCount);
    samples.consonance = {
      feature: "consonance",
      value: input.aestheticMetrics.consonance.consonanceScore,
      q,
      evidence: `${input.aestheticMetrics.consonance.consonanceScore.toFixed(3)}`,
    };

    const harmonicTensionQ =
      input.tonnetzTrajectory.length > 0
        ? clamp01(input.tonnetzTrajectory.reduce((s, p) => s + p.chord.coverage, 0) / input.tonnetzTrajectory.length)
        : q;
    samples.harmonicTension = {
      feature: "harmonicTension",
      value: input.aestheticMetrics.harmonicTension.averageVoiceLeadingDistance,
      q: harmonicTensionQ,
      evidence: `average voice-leading distance ${input.aestheticMetrics.harmonicTension.averageVoiceLeadingDistance.toFixed(2)} semitones`,
    };

    const p = input.aestheticMetrics.predictability;
    const predictabilityValue = p.maxEntropyBits > 0 ? 1 - p.conditionalEntropyBits / p.maxEntropyBits : 0;
    samples.predictability = {
      feature: "predictability",
      value: predictabilityValue,
      q,
      evidence: `${predictabilityValue.toFixed(2)} (conditional entropy ${p.conditionalEntropyBits.toFixed(2)}/${p.maxEntropyBits.toFixed(2)} bits)`,
    };

    samples.selfSimilarity = {
      feature: "selfSimilarity",
      value: input.aestheticMetrics.selfSimilarity.correlation,
      q,
      evidence: `r=${input.aestheticMetrics.selfSimilarity.correlation.toFixed(2)} at lag ${input.aestheticMetrics.selfSimilarity.bestLagNotes}`,
    };
  }

  if (input.histogram.some((v) => v > 0)) {
    const key = estimateKey(input.histogram);
    samples.modality = {
      feature: "modality",
      value: key.mode,
      q: clamp01(key.correlation),
      evidence: `detected mode: ${key.mode} (key-profile correlation ${key.correlation.toFixed(2)})`,
    };

    samples.diatonicity = {
      feature: "diatonicity",
      value: diatonicity(input.histogram),
      q: dataSufficiency(input.noteCount),
      evidence: `${diatonicity(input.histogram).toFixed(2)}`,
    };
  }

  if (input.scaleFit) {
    samples.scaleCharacter = {
      feature: "scaleCharacter",
      value: input.scaleFit.scaleName,
      q: input.scaleFit.coverage,
      evidence: `best-fit scale: ${input.scaleFit.scaleName} (coverage ${input.scaleFit.coverage.toFixed(2)})`,
    };
  }

  if (input.songForm) {
    const similarities = input.songForm.recurrences.map((r) => r.similarity);
    const value = similarities.length > 0 ? similarities.reduce((s, v) => s + v, 0) / similarities.length : 0;
    samples.formRepetitiveness = {
      feature: "formRepetitiveness",
      value,
      q: clamp01(input.songForm.sections.length / MIN_FORM_WINDOWS_FOR_FULL_CONFIDENCE),
      evidence:
        similarities.length > 0
          ? `${similarities.length} recurring section(s), average similarity ${value.toFixed(2)}`
          : "no recurring sections detected",
    };
  }

  if (input.climax && input.maxTime > 0) {
    const q = clamp01(input.arcSectionCount / MIN_ARC_SECTIONS_FOR_FULL_CONFIDENCE);
    samples.climaxPresence = {
      feature: "climaxPresence",
      value: "present",
      q,
      evidence: `climax detected in section ${input.climax.sectionIndex + 1}`,
    };
    const timing = clamp01((input.climax.startSec + input.climax.endSec) / 2 / input.maxTime);
    samples.climaxTiming = {
      feature: "climaxTiming",
      value: timing,
      q,
      evidence: `climax at ${(timing * 100).toFixed(0)}% through the song`,
    };
  }

  if (input.partLabels.length > 0) {
    samples.instrumentPresence = {
      feature: "instrumentPresence",
      value: input.partLabels.join(", ").toLowerCase(),
      q: 1, // score ground truth (named parts), not an estimate
      evidence: `parts: ${input.partLabels.join(", ")}`,
    };
  }

  if (input.instrumentBuildUp) {
    const isLayered = input.instrumentBuildUp.parts.some((p) => p.firstActiveSegment > 0);
    samples.instrumentTextureBuildUp = {
      feature: "instrumentTextureBuildUp",
      value: isLayered ? "layered" : "constant",
      q: 1, // score ground truth (named parts), not an estimate
      evidence: isLayered
        ? "instrument parts enter at different points in the song"
        : "all instrument parts present from the start",
    };
  }

  return samples;
}

/**
 * Human-readable reason a feature has no sample at all, for a concept's
 * "missing" evidence list — distinguishes "this app cannot measure this from
 * audio" from a generic "not enough evidence" so the report stays honest
 * about *why*, per the project's don't-overclaim-confidence convention.
 */
export function explainUnavailableFeature(feature: FeatureName): string {
  switch (feature) {
    case "syncopation":
      return "Syncopation requires a detected time signature from score/tab input — audio-transcribed input has no notated meter to measure it from.";
    case "instrumentTextureBuildUp":
      return "Instrument build-up requires named instrument parts from score/tab input — audio-transcribed input has no per-instrument identity (Basic Pitch only estimates pitch, not which instrument played it).";
    case "instrumentPresence":
      return "Checking for a specific instrument requires named instrument parts from score/tab input — audio-transcribed input has no per-instrument identity (Basic Pitch only estimates pitch, not which instrument played it).";
    case "climaxPresence":
    case "climaxTiming":
      return "Not enough distinct sections were found in the song's arc to identify a climax.";
    case "formRepetitiveness":
      return "Not enough structural signal was found to detect recurring sections.";
    case "scaleCharacter":
      return "The pitch content didn't clearly fit any of the known scale templates.";
    default:
      return "Not enough signal was detected for this feature in this analysis.";
  }
}
