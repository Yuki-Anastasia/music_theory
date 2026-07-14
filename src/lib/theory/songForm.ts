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

// Caps how many "X recurs at Y" call-outs get surfaced, even if many pairs
// clear the threshold -- keeps the fact readable rather than an exhaustive
// pairwise dump.
const MAX_RECURRENCES = 3;

export interface FormWindow {
  startSec: number;
  endSec: number;
}

export interface RecurrenceMatch {
  a: FormWindow;
  b: FormWindow;
  similarity: number;
}

/** One window's structural label -- windows sharing a group letter have similar pitch-class content. */
export interface FormSection extends FormWindow {
  group: string;
}

export interface SongFormResult {
  /** Every non-empty window, chronological, letter-labeled by which other windows it resembles. */
  sections: FormSection[];
  /** The MAX_RECURRENCES strongest non-adjacent matches, for narrating specific "this callback" moments. */
  recurrences: RecurrenceMatch[];
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

/** 0->A, 1->B, ..., 25->Z, 26->AA, 27->AB, ... */
function groupLetters(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Minimal union-find: path-compressed find, arbitrary-root union. */
function makeUnionFind(size: number) {
  const parent = Array.from({ length: size }, (_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number): void {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  return { find, union };
}

/**
 * Builds a whole-song structural reading from pairwise window similarity:
 * ANY two windows (adjacent or not) whose content matches above threshold
 * are merged into the same lettered group via union-find, so a sustained
 * repeated riff spanning many consecutive windows reads as one contiguous
 * group ("A A A A"), while a genuinely new passage starts a new letter.
 * Separately, the MAX_RECURRENCES strongest non-adjacent matches are kept
 * as call-outs for narrating specific "this comes back later" moments.
 *
 * This only sees pitch-class content (octave-blind, like the rest of the
 * Tonnetz/key pipeline), so a passage that reuses the same notes an octave
 * higher reads as the same group even if it also sounds registrally
 * distinct -- a known simplification, not a bug.
 *
 * Framed as a hypothesis, never as genre-specific labels like "verse" or
 * "chorus", since the system has no ground truth for song-form terminology.
 * Returns null when there's no signal to work with at all (not a forced
 * single-section read).
 */
export function analyzeSongForm(events: NormalizedNoteEvent[], maxTime: number): SongFormResult | null {
  const windows = buildFormWindows(events, maxTime);
  if (windows.length === 0) return null;

  const uf = makeUnionFind(windows.length);
  const recurrenceCandidates: RecurrenceMatch[] = [];

  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const similarity = similarityFromDistance(euclideanDistance(windows[i].histogram, windows[j].histogram));
      if (similarity < RECURRENCE_SIMILARITY_THRESHOLD) continue;
      uf.union(i, j);
      if (j - i >= MIN_GAP_WINDOWS) {
        recurrenceCandidates.push({ a: windows[i].window, b: windows[j].window, similarity });
      }
    }
  }

  const labelByRoot = new Map<number, string>();
  const sections: FormSection[] = windows.map((w, i) => {
    const root = uf.find(i);
    if (!labelByRoot.has(root)) labelByRoot.set(root, groupLetters(labelByRoot.size));
    return { ...w.window, group: labelByRoot.get(root)! };
  });

  const recurrences = recurrenceCandidates.sort((a, b) => b.similarity - a.similarity).slice(0, MAX_RECURRENCES);

  return { sections, recurrences };
}
