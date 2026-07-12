import { NormalizedNoteEvent } from "./normalizedEvents";
import type { MeterPoint, NotatedChordPoint } from "../score/musicXml";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";

// How finely each notated beat is subdivided when building the metric grid
// (4 -> 16th-note-equivalent resolution for a quarter-note beat).
const SUBDIVISIONS_PER_BEAT = 4;
const MAX_WEIGHT = 3; // downbeat
const MIN_WEIGHT = -2; // finest (16th-level) off-beat position
const STRONG_BEAT_THRESHOLD = 2; // "medium" or "strong" counts as a strong-enough beat
const EPS = 1e-9;

export type MetricStrength = "strong" | "medium" | "weak";
export interface BeatWeightPoint {
  beatIndex: number;
  weight: number;
  strength: MetricStrength;
}

/**
 * Simplified metric-weight scale per notated beat, coarsest to finest:
 * 3 = downbeat, 2 = a secondary strong beat (the midpoint of an even,
 * >=4-beat simple meter, or each group-downbeat of a compound meter), 0 =
 * every other notated beat. This is a deliberately simplified heuristic —
 * not full Lerdahl & Jackendoff generative-theory metrical structure — but
 * reproduces the standard textbook cases: 4/4 -> [3,0,2,0], 3/4 -> [3,0,0],
 * 6/8 -> [3,0,0,2,0,0]. Irregular meters (5/4, 7/8, ...) fall back to
 * downbeat-only, which both branches already produce naturally.
 */
export function beatWeightsForMeter(numerator: number, denominator: number): number[] {
  const n = numerator > 0 ? numerator : 4;
  const d = denominator > 0 ? denominator : 4;
  const weights = new Array(n).fill(0);
  const isCompound = d === 8 && n % 3 === 0 && n >= 6;

  if (isCompound) {
    for (let i = 0; i < n; i += 3) {
      weights[i] = i === 0 ? 3 : 2;
    }
  } else {
    weights[0] = 3;
    if (n >= 4 && n % 2 === 0) weights[n / 2] = 2;
  }

  return weights;
}

export function describeBeatWeights(numerator: number, denominator: number): BeatWeightPoint[] {
  return beatWeightsForMeter(numerator, denominator).map((weight, beatIndex) => ({
    beatIndex,
    weight,
    strength: weight >= 3 ? "strong" : weight === 2 ? "medium" : "weak",
  }));
}

interface MetricGrid {
  barStart: number;
  barEnd: number;
  numerator: number;
  beatWeights: number[];
  slotSeconds: number;
}

/**
 * Turns bar-start timestamps into contiguous grids covering [barStart,
 * barEnd) each, where barEnd is simply the next bar's start (or maxTime for
 * the last bar) — real elapsed seconds divided into `numerator` equal beat
 * slots, needing no tempo beyond what's already baked into the bar-start
 * timestamps themselves.
 */
function buildMetricGrids(meterTimeline: MeterPoint[], maxTime: number): MetricGrid[] {
  const sorted = [...meterTimeline].sort((a, b) => a.time - b.time);
  const grids: MetricGrid[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const barStart = sorted[i].time;
    const barEnd = i + 1 < sorted.length ? sorted[i + 1].time : maxTime;
    if (barEnd <= barStart) continue; // malformed/zero-length bar

    const numerator = sorted[i].numerator > 0 ? sorted[i].numerator : 4;
    const denominator = sorted[i].denominator > 0 ? sorted[i].denominator : 4;
    const totalSlots = numerator * SUBDIVISIONS_PER_BEAT;

    grids.push({
      barStart,
      barEnd,
      numerator,
      beatWeights: beatWeightsForMeter(numerator, denominator),
      slotSeconds: (barEnd - barStart) / totalSlots,
    });
  }

  return grids;
}

function findGridIndex(grids: MetricGrid[], time: number): number {
  let idx = -1;
  for (let i = 0; i < grids.length; i++) {
    if (grids[i].barStart <= time + EPS) idx = i;
    else break;
  }
  return idx;
}

function weightForSlot(grid: MetricGrid, slotIndex: number): number {
  const beatIndex = Math.floor(slotIndex / SUBDIVISIONS_PER_BEAT);
  const subSlot = slotIndex % SUBDIVISIONS_PER_BEAT;
  if (subSlot === 0) return grid.beatWeights[Math.min(beatIndex, grid.beatWeights.length - 1)];
  if (subSlot === 2) return -1; // the mid-beat "and"
  return -2; // finer (16th-level) off-beat position
}

function slotTime(grid: MetricGrid, slotIndex: number): number {
  return grid.barStart + slotIndex * grid.slotSeconds;
}

function metricWeightAt(grids: MetricGrid[], time: number): number {
  const idx = findGridIndex(grids, time);
  if (idx < 0) return 0;
  const grid = grids[idx];
  const totalSlots = grid.numerator * SUBDIVISIONS_PER_BEAT;
  const slotIndex = Math.min(Math.round((time - grid.barStart) / grid.slotSeconds), totalSlots - 1);
  return weightForSlot(grid, slotIndex);
}

/**
 * Max metric weight of any grid slot strictly inside (start, end) — used to
 * detect a note that "holds through" a stronger beat instead of
 * re-articulating it. Walks slot-by-slot (not via metricWeightAt, to avoid
 * float round-tripping) across however many bars the span crosses, so a
 * held note spanning a barline is handled correctly. Each bar contributes
 * its own slots [0, totalSlots) only — the shared instant at a barline is
 * contributed exactly once, by the next bar's slot 0.
 */
function maxWeightStrictlyBetween(grids: MetricGrid[], start: number, end: number): number | null {
  if (grids.length === 0 || end <= start + EPS) return null;
  const startIdx = findGridIndex(grids, start);
  const endIdx = findGridIndex(grids, Math.max(start, end - EPS));
  if (startIdx < 0 || endIdx < 0) return null;

  let best: number | null = null;
  for (let gi = startIdx; gi <= endIdx; gi++) {
    const grid = grids[gi];
    const totalSlots = grid.numerator * SUBDIVISIONS_PER_BEAT;
    for (let slotIndex = 0; slotIndex < totalSlots; slotIndex++) {
      const t = slotTime(grid, slotIndex);
      if (t <= start + EPS || t >= end - EPS) continue;
      const w = weightForSlot(grid, slotIndex);
      if (best === null || w > best) best = w;
    }
  }
  return best;
}

export interface SyncopationEstimate {
  rawScore: number;
  maxPossibleScore: number;
  normalizedScore: number; // rawScore/maxPossibleScore, bounded [0,1]
  averageContributionPerPair: number; // rawScore/pairCount, weight-units, unbounded
  pairCount: number;
}

/**
 * Longuet-Higgins & Lee (1984)-inspired syncopation estimate: merges onset
 * times across ALL parts into one composite attack stream (a documented
 * simplification — their original model is monophonic), then for each
 * consecutive onset pair, checks whether a metrically stronger grid slot
 * falls strictly inside that span (the note "skips" re-articulating a
 * stronger beat). Reports raw+ceiling+normalized+per-pair-average rather
 * than forcing a single ratio, matching this codebase's existing
 * convention (see RhythmicEntropyEstimate, ConsonanceEstimate).
 */
function estimateSyncopation(events: NormalizedNoteEvent[], grids: MetricGrid[]): SyncopationEstimate {
  const empty: SyncopationEstimate = {
    rawScore: 0,
    maxPossibleScore: 0,
    normalizedScore: 0,
    averageContributionPerPair: 0,
    pairCount: 0,
  };
  if (events.length === 0 || grids.length === 0) return empty;

  const coveredStart = grids[0].barStart;
  const coveredEnd = grids[grids.length - 1].barEnd;
  const onsetTimes = Array.from(new Set(events.map((e) => e.time)))
    .filter((t) => t >= coveredStart - EPS && t <= coveredEnd + EPS)
    .sort((a, b) => a - b);

  let rawScore = 0;
  let pairCount = 0;
  for (let i = 0; i < onsetTimes.length - 1; i++) {
    const onset = onsetTimes[i];
    const next = onsetTimes[i + 1];
    pairCount++;

    const ownWeight = metricWeightAt(grids, onset);
    const strongerInside = maxWeightStrictlyBetween(grids, onset, next);
    if (strongerInside !== null && strongerInside > ownWeight) {
      rawScore += strongerInside - ownWeight;
    }
  }

  const maxPossibleScore = pairCount * (MAX_WEIGHT - MIN_WEIGHT);
  return {
    rawScore,
    maxPossibleScore,
    normalizedScore: maxPossibleScore > 0 ? rawScore / maxPossibleScore : 0,
    averageContributionPerPair: pairCount > 0 ? rawScore / pairCount : 0,
    pairCount,
  };
}

export interface HarmonicRhythmAlignment {
  source: "notatedChords" | "detectedChords";
  totalChordChanges: number;
  onStrongBeatCount: number;
  strongBeatFraction: number;
}

/**
 * What fraction of chord changes land on a strong/medium metric beat.
 * Prefers notated chord symbols (exact onset times) when the score has
 * them; falls back to the audio/harmony-derived Tonnetz trajectory
 * otherwise (Guitar Pro has no notated chord symbols). The fallback's 1s
 * window/hop resolution is much coarser than the metric grid, so
 * `source` is exposed for the UI/LLM to caveat that case appropriately.
 */
function analyzeHarmonicRhythmAlignment(
  grids: MetricGrid[],
  tonnetzTrajectory: TonnetzTimelinePoint[],
  notatedChordTimeline: NotatedChordPoint[]
): HarmonicRhythmAlignment | null {
  if (grids.length === 0) return null;

  let source: "notatedChords" | "detectedChords";
  let changeTimes: number[];
  if (notatedChordTimeline.length > 0) {
    source = "notatedChords";
    changeTimes = notatedChordTimeline.map((c) => c.time);
  } else if (tonnetzTrajectory.length > 0) {
    source = "detectedChords";
    changeTimes = tonnetzTrajectory.map((p) => p.time);
  } else {
    return null;
  }

  const onStrongBeatCount = changeTimes.filter((t) => metricWeightAt(grids, t) >= STRONG_BEAT_THRESHOLD).length;
  return {
    source,
    totalChordChanges: changeTimes.length,
    onStrongBeatCount,
    strongBeatFraction: onStrongBeatCount / changeTimes.length,
  };
}

function collapseMeterChanges(meterTimeline: MeterPoint[]): MeterPoint[] {
  const sorted = [...meterTimeline].sort((a, b) => a.time - b.time);
  const collapsed: MeterPoint[] = [];
  for (const point of sorted) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.numerator === point.numerator && last.denominator === point.denominator) continue;
    collapsed.push(point);
  }
  return collapsed;
}

export interface MeterSummaryPoint {
  time: number;
  numerator: number;
  denominator: number;
  beatWeights: BeatWeightPoint[];
}

export interface MeterAnalysisResult {
  meterSummary: MeterSummaryPoint[];
  syncopation: SyncopationEstimate;
  harmonicRhythmAlignment: HarmonicRhythmAlignment | null;
}

/**
 * Only meaningful for score-imported input — meterTimeline is empty for
 * audio-transcribed events (no bar data), in which case this returns null
 * rather than a forced/empty result, matching the project's "don't assert
 * without data" convention.
 */
export function analyzeMeter(
  events: NormalizedNoteEvent[],
  meterTimeline: MeterPoint[],
  maxTime: number,
  tonnetzTrajectory: TonnetzTimelinePoint[] = [],
  notatedChordTimeline: NotatedChordPoint[] = []
): MeterAnalysisResult | null {
  if (meterTimeline.length === 0 || events.length === 0 || maxTime <= 0) return null;

  const grids = buildMetricGrids(meterTimeline, maxTime);
  if (grids.length === 0) return null;

  const meterSummary: MeterSummaryPoint[] = collapseMeterChanges(meterTimeline).map((point) => ({
    time: point.time,
    numerator: point.numerator,
    denominator: point.denominator,
    beatWeights: describeBeatWeights(point.numerator, point.denominator),
  }));

  return {
    meterSummary,
    syncopation: estimateSyncopation(events, grids),
    harmonicRhythmAlignment: analyzeHarmonicRhythmAlignment(grids, tonnetzTrajectory, notatedChordTimeline),
  };
}
