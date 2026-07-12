import { NormalizedNoteEvent } from "./normalizedEvents";

const DYNAMICS_SEGMENTS = 8;
// Per-segment slope (loudness/segment-index) below this magnitude counts as "stable".
const TREND_SLOPE_THRESHOLD = 0.01;

export interface DynamicsSummary {
  averageLoudness: number;
  dynamicRange: number;
  trend: "crescendo" | "diminuendo" | "stable";
}

function segmentAverages(events: NormalizedNoteEvent[], maxTime: number, segments: number): number[] {
  const segSec = maxTime / segments;
  const sums = new Array(segments).fill(0);
  const counts = new Array(segments).fill(0);
  for (const event of events) {
    const index = Math.min(segments - 1, Math.floor(event.time / segSec));
    sums[index] += event.confidence;
    counts[index] += 1;
  }
  return sums.map((sum, i) => (counts[i] === 0 ? 0 : sum / counts[i]));
}

/** Least-squares slope of values against their index (0..n-1). */
function linearSlope(values: number[]): number {
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Uses Basic Pitch's per-note amplitude (NormalizedNoteEvent.confidence) as
 * a loudness proxy. Splits the song into DYNAMICS_SEGMENTS equal-length
 * segments, averages loudness per segment, and reports the overall range
 * and a least-squares trend across segments.
 */
export function dynamicsSummary(events: NormalizedNoteEvent[]): DynamicsSummary {
  if (events.length === 0) return { averageLoudness: 0, dynamicRange: 0, trend: "stable" };

  const maxTime = Math.max(...events.map((e) => e.time + e.durationSeconds));
  const averages = segmentAverages(events, maxTime, DYNAMICS_SEGMENTS);

  const averageLoudness = events.reduce((s, e) => s + e.confidence, 0) / events.length;
  const dynamicRange = Math.max(...averages) - Math.min(...averages);
  const slope = linearSlope(averages);
  const trend = Math.abs(slope) < TREND_SLOPE_THRESHOLD ? "stable" : slope > 0 ? "crescendo" : "diminuendo";

  return { averageLoudness, dynamicRange, trend };
}
