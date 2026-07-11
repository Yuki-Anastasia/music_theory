import { NormalizedNoteEvent, pitchClassHistogram } from "./normalizedEvents";
import { pitchClassDFT, FourierCoefficient } from "./fourierAnalysis";

export interface FourierTimelinePoint {
  time: number; // window start, seconds
  coefficients: FourierCoefficient[]; // k=0..6
}

/**
 * Same sliding-window shape as keyTimeline.ts: windowSec/hopSec default to
 * the same values so the two timelines line up on the same X axis.
 */
export function estimateFourierTimeline(
  events: NormalizedNoteEvent[],
  windowSec = 8,
  hopSec = 4
): FourierTimelinePoint[] {
  if (events.length === 0) return [];

  const maxTime = Math.max(...events.map((e) => e.time + e.durationSeconds));
  const points: FourierTimelinePoint[] = [];

  for (let start = 0; start < maxTime; start += hopSec) {
    const histogram = pitchClassHistogram(events, start, start + windowSec);
    if (histogram.every((v) => v === 0)) continue;
    points.push({ time: start, coefficients: pitchClassDFT(histogram) });
  }

  return points;
}
