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
