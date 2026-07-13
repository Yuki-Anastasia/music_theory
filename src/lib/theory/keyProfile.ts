import { PITCH_CLASS_NAMES } from "../audio/pitch";

// Krumhansl & Kessler (1990) tonal hierarchy profiles. Major is quoted
// directly in the technical spec (A-3); minor isn't listed there, so it's
// been cross-checked against the published values.
export const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export type Mode = "major" | "minor";

export interface KeyCandidate {
  tonic: number; // pitch class 0-11
  mode: Mode;
  correlation: number;
}

export interface KeyEstimate {
  tonic: number;
  mode: Mode;
  correlation: number;
  /** 'low' when the runner-up is too close to call — spec's D-3 "don't assert on a close call" rule. */
  confidence: "high" | "low";
  runnerUp?: KeyCandidate;
}

// Below this margin between 1st and 2nd place, treat the call as ambiguous.
const CONFIDENCE_MARGIN = 0.03;

export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;

  let numerator = 0;
  let sumSqA = 0;
  let sumSqB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    numerator += da * db;
    sumSqA += da * da;
    sumSqB += db * db;
  }

  const denominator = Math.sqrt(sumSqA * sumSqB);
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Rotates a 12-value profile so index 0 aligns with the given tonic. */
function rotateProfile(profile: number[], tonic: number): number[] {
  return Array.from({ length: 12 }, (_, i) => profile[(i - tonic + 12) % 12]);
}

/** All 24 (12 major + 12 minor) correlations against the histogram, best first. */
export function correlateAllKeys(histogram: number[]): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    candidates.push({ tonic, mode: "major", correlation: pearsonCorrelation(histogram, rotateProfile(MAJOR_PROFILE, tonic)) });
    candidates.push({ tonic, mode: "minor", correlation: pearsonCorrelation(histogram, rotateProfile(MINOR_PROFILE, tonic)) });
  }
  return candidates.sort((a, b) => b.correlation - a.correlation);
}

export function estimateKey(histogram: number[]): KeyEstimate {
  const [best, runnerUp] = correlateAllKeys(histogram);
  const confidence = best.correlation - runnerUp.correlation < CONFIDENCE_MARGIN ? "low" : "high";
  return { ...best, confidence, runnerUp: confidence === "low" ? runnerUp : undefined };
}

export function keyLabel(candidate: Pick<KeyCandidate, "tonic" | "mode">): string {
  const name = PITCH_CLASS_NAMES[candidate.tonic];
  return candidate.mode === "major" ? `${name}` : `${name}m`;
}

export interface KeySegment {
  start: number;
  end: number;
  tonic: number;
  mode: Mode;
  label: string;
  /** Caller-defined per-point flag (e.g. "low confidence" for an estimated key) — true if any point folded into this segment was flagged. */
  flagged: boolean;
}

/**
 * Collapses a time-ordered sequence of points into contiguous [start, end)
 * segments wherever keyOf(point) resolves to the same label, extending each
 * segment's end to the next segment's start (or durationSec for the last).
 * Generic over point shape so both a KeyTimelinePoint (estimated key,
 * keyOf: p => p.key) and a NotatedKeyPoint (keyOf: p => p) can share this
 * loop instead of each re-deriving it.
 */
export function collapseKeySegments<P extends { time: number }>(
  points: P[],
  durationSec: number,
  keyOf: (p: P) => { tonic: number; mode: Mode },
  flagOf?: (p: P) => boolean
): KeySegment[] {
  const segments: KeySegment[] = [];
  for (const point of points) {
    const key = keyOf(point);
    const label = keyLabel(key);
    const last = segments[segments.length - 1];
    if (last && last.label === label) {
      last.flagged = last.flagged || (flagOf?.(point) ?? false);
    } else {
      segments.push({
        start: point.time,
        end: point.time,
        tonic: key.tonic,
        mode: key.mode,
        label,
        flagged: flagOf?.(point) ?? false,
      });
    }
  }
  for (let i = 0; i < segments.length; i++) {
    segments[i].end = i + 1 < segments.length ? segments[i + 1].start : durationSec;
  }
  return segments;
}
