import { NormalizedNoteEvent } from "./normalizedEvents";

// Matches dynamicsAnalysis.ts's DYNAMICS_SEGMENTS convention, so a "which
// segment does each part enter in" reading lines up with the same
// granularity as the dynamics/arc timelines elsewhere in the facts.
const DENSITY_SEGMENTS = 8;

// Percussion onsets carry no partLabel (see normalizedEvents.ts), so they're
// reported as a pseudo-part under this sentinel rather than silently
// dropped from the build-up picture. Exported so summaryPrompt.ts can
// translate it to a display label instead of printing the raw sentinel.
export const PERCUSSION_PART_LABEL = "percussion";

export interface PartDensityTimeline {
  partLabel: string;
  /** Note count per segment, chronological. */
  countsBySegment: number[];
  /** Index of the first segment this part plays in at all. */
  firstActiveSegment: number;
}

export interface InstrumentBuildUp {
  segmentDurationSec: number;
  parts: PartDensityTimeline[];
}

/**
 * Per-part note density over time -- score-import only, since it keys off
 * NormalizedNoteEvent.partLabel (audio-transcribed events never set it, so
 * this naturally returns null there). Splits the song into DENSITY_SEGMENTS
 * equal windows and counts each part's notes per window, so a texture
 * build-up (e.g. "guitar alone, then drums enter, then bass") becomes
 * readable as which segment each part's count first goes above zero.
 */
export function analyzeInstrumentBuildUp(
  events: NormalizedNoteEvent[],
  percussionOnsets: number[],
  maxTime: number
): InstrumentBuildUp | null {
  const partLabels = Array.from(new Set(events.map((e) => e.partLabel).filter((p): p is string => !!p)));
  if (partLabels.length === 0 && percussionOnsets.length === 0) return null;
  if (maxTime <= 0) return null;

  const segmentDurationSec = maxTime / DENSITY_SEGMENTS;
  const segmentIndexFor = (time: number) => Math.min(DENSITY_SEGMENTS - 1, Math.floor(time / segmentDurationSec));

  const buildTimeline = (label: string, times: number[]): PartDensityTimeline => {
    const countsBySegment = new Array(DENSITY_SEGMENTS).fill(0);
    for (const time of times) countsBySegment[segmentIndexFor(time)]++;
    const firstActiveSegment = countsBySegment.findIndex((c) => c > 0);
    return { partLabel: label, countsBySegment, firstActiveSegment: firstActiveSegment === -1 ? DENSITY_SEGMENTS : firstActiveSegment };
  };

  const parts = partLabels.map((label) =>
    buildTimeline(
      label,
      events.filter((e) => e.partLabel === label).map((e) => e.time)
    )
  );
  if (percussionOnsets.length > 0) {
    parts.push(buildTimeline(PERCUSSION_PART_LABEL, percussionOnsets));
  }

  return { segmentDurationSec, parts };
}
