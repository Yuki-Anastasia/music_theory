import { FIVE_LIMIT_RATIOS_BY_INTERVAL_CLASS } from "../audio/pitch";
import { NormalizedNoteEvent } from "./normalizedEvents";
import { ChordEstimate, triadTones } from "./tonnetz";
import { TonnetzTimelinePoint } from "./tonnetzTimeline";

/**
 * These are mathematical proxies that may correlate with perceived beauty —
 * not a definition or proof of it. "Beauty" itself has no agreed
 * mathematical definition; each metric here is a named, citable theory
 * (Euler, Shannon, Neo-Riemannian voice leading, autocorrelation) applied to
 * the song's already-computed data.
 */

// --- 1. Consonance: Euler's Gradus Suavitatis (1739) ---

/** Γ(n) = 1 + Σ aᵢ(pᵢ - 1) for n = Π pᵢ^aᵢ. Lower = "smoother"/more consonant. */
export function eulerGradusSuavitatis(n: number): number {
  let remaining = n;
  let sum = 0;
  for (let p = 2; p <= remaining; p++) {
    while (remaining % p === 0) {
      sum += p - 1;
      remaining /= p;
    }
  }
  return 1 + sum;
}

/** Gradus Suavitatis of the 5-limit just-intonation ratio nearest to a given interval class (0-11 semitones). */
export function intervalGradusSuavitatis(intervalClass: number): number {
  const [num, den] = FIVE_LIMIT_RATIOS_BY_INTERVAL_CLASS[((intervalClass % 12) + 12) % 12];
  return eulerGradusSuavitatis(num * den);
}

export interface ConsonanceEstimate {
  averageGradus: number;
  consonanceScore: number; // 1 / averageGradus — larger is more consonant
}

/** Weighted-average Gradus Suavitatis over every co-sounding pitch-class pair in a histogram. */
export function consonanceOfHistogram(histogram: number[]): ConsonanceEstimate {
  let weightedSum = 0;
  let totalWeight = 0;
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      const weight = histogram[i] * histogram[j];
      if (weight === 0) continue;
      weightedSum += weight * intervalGradusSuavitatis(j - i);
      totalWeight += weight;
    }
  }
  if (totalWeight === 0) return { averageGradus: 0, consonanceScore: 0 };
  const averageGradus = weightedSum / totalWeight;
  return { averageGradus, consonanceScore: 1 / averageGradus };
}

// --- 2. Harmonic tension: parsimonious voice-leading distance (Neo-Riemannian theory) ---

const TRIAD_PERMUTATIONS: readonly [number, number, number][] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function circularDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

/** Minimal total semitone motion (over all 3-voice pairings) to move from triad a to triad b. */
export function voiceLeadingDistance(a: Pick<ChordEstimate, "root" | "mode">, b: Pick<ChordEstimate, "root" | "mode">): number {
  const notesA = triadTones(a.root, a.mode);
  const notesB = triadTones(b.root, b.mode);
  let best = Infinity;
  for (const perm of TRIAD_PERMUTATIONS) {
    let sum = 0;
    for (let i = 0; i < 3; i++) {
      sum += circularDistance(notesA[i], notesB[perm[i]]);
    }
    best = Math.min(best, sum);
  }
  return best;
}

export interface HarmonicTensionEstimate {
  averageVoiceLeadingDistance: number;
  maxVoiceLeadingDistance: number;
}

/** Average/max voice-leading distance between consecutive chords in a Tonnetz trajectory. */
export function harmonicTensionOfTrajectory(trajectory: TonnetzTimelinePoint[]): HarmonicTensionEstimate {
  if (trajectory.length < 2) return { averageVoiceLeadingDistance: 0, maxVoiceLeadingDistance: 0 };
  const distances = trajectory
    .slice(1)
    .map((point, i) => voiceLeadingDistance(trajectory[i].chord, point.chord));
  return {
    averageVoiceLeadingDistance: distances.reduce((s, v) => s + v, 0) / distances.length,
    maxVoiceLeadingDistance: Math.max(...distances),
  };
}

// --- 3. Predictability: Shannon conditional entropy (1948) + shared transition matrix ---

/** Order-1 pitch-class transition matrix, row-normalized to probabilities: matrix[a][b] = p(b|a). */
export function buildPitchClassTransitionMatrix(events: NormalizedNoteEvent[]): number[][] {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const counts: number[][] = Array.from({ length: 12 }, () => new Array(12).fill(0));
  const rowTotals = new Array(12).fill(0);
  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i].pitchClass;
    const to = sorted[i + 1].pitchClass;
    counts[from][to] += 1;
    rowTotals[from] += 1;
  }
  return counts.map((row, a) => row.map((c) => (rowTotals[a] === 0 ? 0 : c / rowTotals[a])));
}

export interface PredictabilityEstimate {
  conditionalEntropyBits: number;
  maxEntropyBits: number;
}

/** H(Xₙ₊₁|Xₙ) = Σₐ p(a) [-Σᵦ p(b|a) log₂ p(b|a)], weighted by each row's observation count. */
export function conditionalPitchEntropy(events: NormalizedNoteEvent[]): PredictabilityEstimate {
  const maxEntropyBits = Math.log2(12);
  const sorted = [...events].sort((a, b) => a.time - b.time);
  if (sorted.length < 2) return { conditionalEntropyBits: 0, maxEntropyBits };

  const matrix = buildPitchClassTransitionMatrix(events);
  const rowTotals = new Array(12).fill(0);
  for (let i = 0; i < sorted.length - 1; i++) {
    rowTotals[sorted[i].pitchClass] += 1;
  }
  const totalTransitions = sorted.length - 1;

  let conditionalEntropy = 0;
  for (let a = 0; a < 12; a++) {
    if (rowTotals[a] === 0) continue;
    const pRow = rowTotals[a] / totalTransitions;
    let rowEntropy = 0;
    for (let b = 0; b < 12; b++) {
      const p = matrix[a][b];
      if (p === 0) continue;
      rowEntropy -= p * Math.log2(p);
    }
    conditionalEntropy += pRow * rowEntropy;
  }
  return { conditionalEntropyBits: conditionalEntropy, maxEntropyBits };
}

// --- 4. Self-similarity: normalized autocorrelation of the melodic contour ---

export interface SelfSimilarityEstimate {
  bestLagNotes: number;
  correlation: number;
}

/** Autocorrelation r(τ) = Σ(x[n]-μ)(x[n+τ]-μ) / Σ(x[n]-μ)² of the note-index MIDI sequence, lag in notes. */
export function melodicSelfSimilarity(events: NormalizedNoteEvent[]): SelfSimilarityEstimate {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const x = sorted.map((e) => e.midiNote);
  const n = x.length;
  if (n < 4) return { bestLagNotes: 0, correlation: 0 };

  const mean = x.reduce((s, v) => s + v, 0) / n;
  const variance = x.reduce((s, v) => s + (v - mean) ** 2, 0);
  if (variance === 0) return { bestLagNotes: 0, correlation: 0 };

  const maxLag = Math.min(n - 1, 64);
  let bestLag = 0;
  let bestCorrelation = -Infinity;
  for (let lag = 1; lag <= maxLag; lag++) {
    let covariance = 0;
    for (let i = 0; i < n - lag; i++) {
      covariance += (x[i] - mean) * (x[i + lag] - mean);
    }
    const correlation = covariance / variance;
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }
  return { bestLagNotes: bestLag, correlation: bestCorrelation };
}

// --- 5. Generation: sampling a new pitch-class sequence from the learned transition matrix ---

/** Samples a pitch-class sequence from a 1st-order Markov model — a concrete demonstration of "the algorithm," not a re-creation of the composer's process. */
export function generateMarkovSequence(
  matrix: number[][],
  startPitchClass: number,
  length: number,
  rng: () => number = Math.random
): number[] {
  const sequence: number[] = [startPitchClass];
  let current = startPitchClass;
  for (let i = 1; i < length; i++) {
    const row = matrix[current];
    const rowTotal = row.reduce((s, v) => s + v, 0);
    if (rowTotal === 0) {
      // No observed transitions from this pitch class — stay put rather than inventing data.
      sequence.push(current);
      continue;
    }
    let roll = rng() * rowTotal;
    let next = 0;
    for (let pc = 0; pc < 12; pc++) {
      roll -= row[pc];
      if (roll <= 0) {
        next = pc;
        break;
      }
    }
    sequence.push(next);
    current = next;
  }
  return sequence;
}

// --- Aggregate ---

export interface AestheticMetrics {
  consonance: ConsonanceEstimate;
  harmonicTension: HarmonicTensionEstimate;
  predictability: PredictabilityEstimate;
  selfSimilarity: SelfSimilarityEstimate;
}

/**
 * `histogram` should reflect the full texture (consonance/dissonance is
 * heard across all voices), while `melodyEvents` should be the extracted
 * melody line only (see voiceSeparation.ts) — predictability and
 * self-similarity are musically about the tune, not a flattened mix of
 * melody, bass, and accompaniment notes.
 */
export function analyzeAesthetics(
  melodyEvents: NormalizedNoteEvent[],
  histogram: number[],
  tonnetzTrajectory: TonnetzTimelinePoint[]
): AestheticMetrics {
  return {
    consonance: consonanceOfHistogram(histogram),
    harmonicTension: harmonicTensionOfTrajectory(tonnetzTrajectory),
    predictability: conditionalPitchEntropy(melodyEvents),
    selfSimilarity: melodicSelfSimilarity(melodyEvents),
  };
}
