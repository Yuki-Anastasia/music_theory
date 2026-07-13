import { NormalizedNoteEvent, pitchClassHistogram } from "./normalizedEvents";
import { estimateKey, KeyEstimate } from "./keyProfile";

export interface KeyTimelinePoint {
  time: number; // window start, seconds
  key: KeyEstimate;
}

/**
 * Slides a window across the song and runs Krumhansl-Schmuckler on each
 * one, producing a coarse "key over time" timeline. windowSec should be
 * long enough to gather a meaningful pitch-class distribution; hopSec
 * controls how often the estimate updates.
 */
export function estimateKeyTimeline(
  events: NormalizedNoteEvent[],
  windowSec = 8,
  hopSec = 4
): KeyTimelinePoint[] {
  if (events.length === 0) return [];

  const maxTime = Math.max(...events.map((e) => e.time + e.durationSeconds));
  const points: KeyTimelinePoint[] = [];

  for (let start = 0; start < maxTime; start += hopSec) {
    const histogram = pitchClassHistogram(events, start, start + windowSec);
    if (histogram.every((v) => v === 0)) continue;
    points.push({ time: start, key: estimateKey(histogram) });
  }

  return points;
}

/** The key estimate active at a given time — the last window whose start <= time. Mirrors meterAnalysis.ts's findGridIndex forward-scan pattern for an ascending time-ordered series. Null if time precedes the first window or the timeline is empty. */
export function keyActiveAt(keyTimeline: KeyTimelinePoint[], time: number): KeyEstimate | null {
  let result: KeyEstimate | null = null;
  for (const point of keyTimeline) {
    if (point.time <= time) result = point.key;
    else break;
  }
  return result;
}
