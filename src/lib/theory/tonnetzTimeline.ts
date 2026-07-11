import { NormalizedNoteEvent, pitchClassHistogram } from "./normalizedEvents";
import { detectChord, ChordEstimate } from "./tonnetz";

export interface TonnetzTimelinePoint {
  time: number; // window start, seconds
  chord: ChordEstimate;
}

/**
 * Chords change faster than keys, so this uses a shorter window/hop than
 * keyTimeline.ts by default. Consecutive windows that detect the same
 * chord collapse into a single point so the resulting trajectory (drawn as
 * a path between triangle centroids) doesn't retrace the same edge over
 * and over.
 */
export function estimateTonnetzTrajectory(
  events: NormalizedNoteEvent[],
  windowSec = 2,
  hopSec = 1
): TonnetzTimelinePoint[] {
  if (events.length === 0) return [];

  const maxTime = Math.max(...events.map((e) => e.time + e.durationSeconds));
  const points: TonnetzTimelinePoint[] = [];

  for (let start = 0; start < maxTime; start += hopSec) {
    const histogram = pitchClassHistogram(events, start, start + windowSec);
    if (histogram.every((v) => v === 0)) continue;
    const chord = detectChord(histogram);

    const last = points[points.length - 1];
    if (last && last.chord.root === chord.root && last.chord.mode === chord.mode) {
      continue; // same chord as the previous point — skip, don't retrace
    }
    points.push({ time: start, chord });
  }

  return points;
}
