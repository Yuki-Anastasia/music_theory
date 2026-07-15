import { NormalizedNoteEvent } from "./normalizedEvents";

const ONSET_BIN_SEC = 0.02;
const MIN_BPM = 40;
const MAX_BPM = 220;
// Below this normalized autocorrelation peak, the rhythm is too irregular
// to call a single tempo with confidence (D-3 "don't assert" rule).
const TEMPO_CONFIDENCE_THRESHOLD = 0.3;

export interface TempoEstimate {
  bpm: number;
  confidence: "high" | "low";
  /** Where the bpm came from — absent (undefined) means "estimated" for
   * callers that construct a TempoEstimate directly (e.g. from a notated
   * tempo marking) without going through estimateTempo(). */
  source?: "notated" | "estimated";
  /** The raw normalized autocorrelation peak behind `confidence`'s high/low
   * threshold — undefined when no lag was scanned at all (too few events or
   * zero-energy signal) or for a directly-constructed (notated) estimate.
   * Exposed as a continuous 0-1 confidence signal for prompt-alignment
   * scoring (src/lib/prompt/featureExtraction.ts), which needs finer
   * granularity than the thresholded high/low label. */
  rawCorrelation?: number;
}

function buildOnsetDensitySignal(events: NormalizedNoteEvent[], binSec: number): number[] {
  const maxTime = Math.max(...events.map((e) => e.time));
  const numBins = Math.ceil(maxTime / binSec) + 1;
  const signal = new Array(numBins).fill(0);
  for (const event of events) {
    signal[Math.floor(event.time / binSec)] += 1;
  }
  return signal;
}

/**
 * Estimates tempo via autocorrelation of the note-onset density signal: the
 * lag (converted to BPM) with the strongest self-similarity is taken as the
 * dominant beat period. Same technique as aestheticMetrics.ts's
 * melodicSelfSimilarity, applied to onset timing instead of pitch.
 */
export function estimateTempo(events: NormalizedNoteEvent[]): TempoEstimate {
  if (events.length < 4) return { bpm: 0, confidence: "low", source: "estimated" };

  const signal = buildOnsetDensitySignal(events, ONSET_BIN_SEC);
  const mean = signal.reduce((s, v) => s + v, 0) / signal.length;
  const centered = signal.map((v) => v - mean);
  const zeroLagEnergy = centered.reduce((s, v) => s + v * v, 0);
  if (zeroLagEnergy === 0) return { bpm: 0, confidence: "low", source: "estimated" };

  const minLag = Math.max(1, Math.round(60 / MAX_BPM / ONSET_BIN_SEC));
  const maxLag = Math.min(centered.length - 1, Math.round(60 / MIN_BPM / ONSET_BIN_SEC));

  let bestLag = minLag;
  let bestCorrelation = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < centered.length - lag; i++) {
      sum += centered[i] * centered[i + lag];
    }
    const normalized = sum / zeroLagEnergy;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  const bpm = 60 / (bestLag * ONSET_BIN_SEC);
  return {
    bpm: Math.round(bpm * 10) / 10,
    confidence: bestCorrelation >= TEMPO_CONFIDENCE_THRESHOLD ? "high" : "low",
    source: "estimated",
    rawCorrelation: Math.max(0, bestCorrelation),
  };
}

export interface RhythmicEntropyEstimate {
  entropyBits: number;
  /** log2(number of distinct duration buckets actually observed) — a
   * data-dependent ceiling, not a fixed universal constant like pitch
   * entropy's log2(12). */
  maxEntropyBits: number;
}

/**
 * Shannon entropy of inter-onset-interval "buckets": each IOI is expressed
 * as log2(IOI / medianIOI) rounded to the nearest integer, so buckets are
 * tempo-agnostic relative duration classes (0 = typical, +1 = ~2x longer,
 * -1 = ~2x shorter — mirroring how notated durations are powers of two).
 */
export function rhythmicEntropy(events: NormalizedNoteEvent[]): RhythmicEntropyEstimate {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const iois = sorted
    .slice(1)
    .map((e, i) => e.time - sorted[i].time)
    .filter((ioi) => ioi > 0);
  if (iois.length === 0) return { entropyBits: 0, maxEntropyBits: 0 };

  const sortedIois = [...iois].sort((a, b) => a - b);
  const medianIoi = sortedIois[Math.floor(sortedIois.length / 2)];

  const bucketCounts = new Map<number, number>();
  for (const ioi of iois) {
    const bucket = Math.round(Math.log2(ioi / medianIoi));
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }

  let entropyBits = 0;
  for (const count of bucketCounts.values()) {
    const p = count / iois.length;
    entropyBits -= p * Math.log2(p);
  }

  return { entropyBits, maxEntropyBits: Math.log2(bucketCounts.size) };
}

export type NoteValueName =
  | "whole"
  | "dottedHalf"
  | "half"
  | "dottedQuarter"
  | "quarter"
  | "quarterTriplet"
  | "dottedEighth"
  | "eighth"
  | "eighthTriplet"
  | "dottedSixteenth"
  | "sixteenth"
  | "sixteenthTriplet"
  | "thirtySecond";

interface NoteValueTemplate {
  name: NoteValueName;
  beats: number; // duration in quarter notes
}

const NOTE_VALUE_TEMPLATES: NoteValueTemplate[] = [
  { name: "whole", beats: 4 },
  { name: "dottedHalf", beats: 3 },
  { name: "half", beats: 2 },
  { name: "dottedQuarter", beats: 1.5 },
  { name: "quarter", beats: 1 },
  { name: "quarterTriplet", beats: 2 / 3 },
  { name: "dottedEighth", beats: 0.75 },
  { name: "eighth", beats: 0.5 },
  { name: "eighthTriplet", beats: 1 / 3 },
  { name: "dottedSixteenth", beats: 0.375 },
  { name: "sixteenth", beats: 0.25 },
  { name: "sixteenthTriplet", beats: 1 / 6 },
  { name: "thirtySecond", beats: 0.125 },
];

export interface NoteValueCount {
  name: NoteValueName;
  count: number;
}

/**
 * Classifies each note's duration against a catalog of common rhythmic
 * values (relative to the quarter note at the given tempo), matching by
 * nearest ratio on a log2 scale -- since note values relate by powers of
 * two (and triplets by thirds), comparing log-ratios rather than raw
 * differences avoids systematically favoring long notes. This is a
 * complementary view to rhythmicEntropy's tempo-agnostic relative buckets:
 * this one names the actual notated-style value (the way a musician would
 * read the rhythm), at the cost of needing a known tempo.
 */
export function noteValueBreakdown(events: NormalizedNoteEvent[], tempoBpm: number): NoteValueCount[] {
  if (events.length === 0 || tempoBpm <= 0) return [];

  const quarterNoteSec = 60 / tempoBpm;
  const counts = new Map<NoteValueName, number>();
  for (const event of events) {
    if (event.durationSeconds <= 0) continue;
    const ratio = event.durationSeconds / quarterNoteSec;
    let best = NOTE_VALUE_TEMPLATES[0];
    let bestDist = Infinity;
    for (const template of NOTE_VALUE_TEMPLATES) {
      const dist = Math.abs(Math.log2(ratio) - Math.log2(template.beats));
      if (dist < bestDist) {
        bestDist = dist;
        best = template;
      }
    }
    counts.set(best.name, (counts.get(best.name) ?? 0) + 1);
  }

  return NOTE_VALUE_TEMPLATES.map((t) => ({ name: t.name, count: counts.get(t.name) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}
