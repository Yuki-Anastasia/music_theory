import { NormalizedNoteEvent, pitchClassHistogram } from "./normalizedEvents";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import {
  consonanceOfHistogram,
  ConsonanceEstimate,
  harmonicTensionOfTrajectory,
  HarmonicTensionEstimate,
  melodicSelfSimilarity,
} from "./aestheticMetrics";
import { dynamicsSummary, DynamicsSummary } from "./dynamicsAnalysis";
import { rhythmicEntropy } from "./rhythmAnalysis";
import { estimateValence, estimateArousal } from "./emotionEstimate";
import { detectMelodyBoundaries } from "./melodySegmentation";

export interface ArcSection {
  startSec: number;
  endSec: number;
  consonance: ConsonanceEstimate;
  harmonicTension: HarmonicTensionEstimate;
  dynamics: DynamicsSummary;
  valence: number;
  arousal: number;
}

/**
 * Splits the song into sections at points where the melody's own content
 * changes (see melodySegmentation.ts), not a fixed equal division, and
 * recomputes the same whole-song metrics (consonance, dynamics, harmonic
 * tension, self-similarity, mood) on each slice — so the analysis can be
 * narrated as an arc rather than a single aggregate. Reuses the exact same
 * pure functions as the whole-song versions; only the input is
 * time-sliced. Tempo is kept as the whole-song estimate since
 * re-estimating it from a short section is unreliable. A melody with no
 * detected internal shift yields a single section spanning the whole
 * song, rather than a forced split.
 */
export function estimateSongArc(
  events: NormalizedNoteEvent[],
  melodyEvents: NormalizedNoteEvent[],
  tonnetzTrajectory: TonnetzTimelinePoint[],
  keyTimeline: KeyTimelinePoint[],
  tempoBpm: number,
  maxTime: number
): ArcSection[] {
  if (events.length === 0 || maxTime <= 0) return [];

  const boundaries = detectMelodyBoundaries(melodyEvents, maxTime);
  const cutPoints = [0, ...boundaries, maxTime];
  const sections: ArcSection[] = [];

  for (let i = 0; i < cutPoints.length - 1; i++) {
    const startSec = cutPoints[i];
    const endSec = cutPoints[i + 1];

    const sectionEvents = events.filter((e) => e.time >= startSec && e.time < endSec);
    if (sectionEvents.length === 0) continue;

    const sectionMelodyEvents = melodyEvents.filter((e) => e.time >= startSec && e.time < endSec);
    const sectionTrajectory = tonnetzTrajectory.filter((p) => p.time >= startSec && p.time < endSec);
    const sectionKeyPoints = keyTimeline.filter((p) => p.time >= startSec && p.time < endSec);

    const sectionHistogram = pitchClassHistogram(events, startSec, endSec);
    const consonance = consonanceOfHistogram(sectionHistogram);
    const dynamics = dynamicsSummary(sectionEvents);
    const entropy = rhythmicEntropy(sectionEvents);
    const harmonicTension = harmonicTensionOfTrajectory(sectionTrajectory);
    const selfSimilarity = melodicSelfSimilarity(sectionMelodyEvents);

    const valence = estimateValence(sectionKeyPoints, consonance.consonanceScore, harmonicTension);
    const arousal = estimateArousal(tempoBpm, dynamics, entropy.entropyBits, harmonicTension, selfSimilarity);

    sections.push({ startSec, endSec, consonance, harmonicTension, dynamics, valence, arousal });
  }

  return sections;
}

export interface ClimaxEstimate {
  sectionIndex: number;
  startSec: number;
  endSec: number;
  /** Composite ranking score, unitless — for picking the argmax section only, not a calibrated "intensity" value. */
  score: number;
}

function minMaxNormalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  return max === min ? values.map(() => 0) : values.map((v) => (v - min) / (max - min));
}

/**
 * Argmax across sections of an equal-weight composite of loudness, harmonic
 * tension, and arousal — each min-max normalized across the song's own
 * sections (scale-invariant per song), summed, then argmax'd. Needs >= 2
 * sections since a relative "peak" is undefined with nothing to contrast
 * against, per the project's don't-assert-without-contrast convention.
 */
export function estimateClimax(sections: ArcSection[]): ClimaxEstimate | null {
  if (sections.length < 2) return null;

  const loudness = minMaxNormalize(sections.map((s) => s.dynamics.averageLoudness));
  const tension = minMaxNormalize(sections.map((s) => s.harmonicTension.averageVoiceLeadingDistance));
  const arousal = minMaxNormalize(sections.map((s) => s.arousal));
  const scores = sections.map((_, i) => loudness[i] + tension[i] + arousal[i]);

  const bestIndex = scores.indexOf(Math.max(...scores));
  const best = sections[bestIndex];
  return { sectionIndex: bestIndex, startSec: best.startSec, endSec: best.endSec, score: scores[bestIndex] };
}
