import { NormalizedNoteEvent } from "./normalizedEvents";
import { normalizedHistogram, euclideanDistance } from "./melodySegmentation";

const FORM_WINDOW_SEC = 6;
// Non-overlapping (unlike keyTimeline/fourierTimeline's overlapping hop) --
// keeps the comparison matrix small and avoids every window trivially
// resembling its own neighbor.
const FORM_HOP_SEC = 6;
// Minimum separation between two windows before they're eligible to "recur"
// -- otherwise the same sustained passage would just match itself.
const MIN_GAP_WINDOWS = 3;
// Two histograms with all mass on different single pitch classes sit at
// distance sqrt(2); tuned against real songs, not just synthetic fixtures.
const RECURRENCE_SIMILARITY_THRESHOLD = 0.8;

export interface FormWindow {
  startSec: number;
  endSec: number;
}

export interface RecurrenceMatch {
  a: FormWindow;
  b: FormWindow;
  similarity: number;
}

function similarityFromDistance(distance: number): number {
  return Math.max(0, 1 - distance / Math.SQRT2);
}

function buildFormWindows(
  events: NormalizedNoteEvent[],
  maxTime: number
): { window: FormWindow; histogram: number[] }[] {
  const windows: { window: FormWindow; histogram: number[] }[] = [];
  for (let start = 0; start + FORM_WINDOW_SEC <= maxTime + 1e-9; start += FORM_HOP_SEC) {
    const histogram = normalizedHistogram(events, start, start + FORM_WINDOW_SEC);
    if (histogram.every((v) => v === 0)) continue;
    windows.push({ window: { startSec: start, endSec: start + FORM_WINDOW_SEC }, histogram });
  }
  return windows;
}

/**
 * Coarse whole-song scan for the SINGLE strongest non-adjacent recurrence --
 * an MVP, not a full form map. Framed as a hypothesis ("this region may
 * recur"), never as a verse/chorus label, since the system has no ground
 * truth for section names or genre-specific form conventions. Returns null
 * (not a forced weak match) when nothing clears the similarity threshold.
 */
export function findStrongestRecurrence(events: NormalizedNoteEvent[], maxTime: number): RecurrenceMatch | null {
  const windows = buildFormWindows(events, maxTime);
  let best: RecurrenceMatch | null = null;

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + MIN_GAP_WINDOWS; j < windows.length; j++) {
      const similarity = similarityFromDistance(euclideanDistance(windows[i].histogram, windows[j].histogram));
      if (similarity < RECURRENCE_SIMILARITY_THRESHOLD) continue;
      if (!best || similarity > best.similarity) {
        best = { a: windows[i].window, b: windows[j].window, similarity };
      }
    }
  }

  return best;
}
