import { NormalizedNoteEvent, pitchClassHistogram } from "./normalizedEvents";

const NOVELTY_WINDOW_SEC = 3;
const NOVELTY_HOP_SEC = 1;
// Two detected boundaries closer together than this are treated as the
// same structural change, not two separate tiny sections.
const MIN_SECTION_SEC = 4;
const PEAK_NEIGHBORHOOD = 2;
// Caps the output at 6 sections even for a very restless melody, so the
// arc stays scannable.
const MAX_BOUNDARIES = 5;

/** Exported for songForm.ts, which reuses the same normalization to compare far-apart windows rather than only-adjacent ones. */
export function normalizedHistogram(events: NormalizedNoteEvent[], start: number, end: number): number[] {
  const histogram = pitchClassHistogram(events, start, end);
  const total = histogram.reduce((s, v) => s + v, 0);
  return total === 0 ? histogram : histogram.map((v) => v / total);
}

export function euclideanDistance(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
}

/**
 * Detects section boundaries from the melody's own content — novelty-based
 * segmentation (Foote, 2000): slide a window over the melody, compare each
 * window's pitch-class distribution to the previous one, and take local
 * peaks in that "novelty" (Euclidean distance) curve as points where the
 * melodic pattern changes (new phrase, new motif, register/key shift).
 * A melody with no clear internal shift returns no boundaries — a single
 * section — rather than a forced split, per the project's "don't assert"
 * ethos.
 */
export function detectMelodyBoundaries(melodyEvents: NormalizedNoteEvent[], maxTime: number): number[] {
  if (melodyEvents.length === 0 || maxTime < NOVELTY_WINDOW_SEC) return [];

  const starts: number[] = [];
  const histograms: number[][] = [];
  for (let start = 0; start + NOVELTY_WINDOW_SEC <= maxTime + 1e-9; start += NOVELTY_HOP_SEC) {
    starts.push(start);
    histograms.push(normalizedHistogram(melodyEvents, start, start + NOVELTY_WINDOW_SEC));
  }
  if (histograms.length < 3) return [];

  const novelty = [0];
  for (let i = 1; i < histograms.length; i++) {
    novelty.push(euclideanDistance(histograms[i], histograms[i - 1]));
  }

  const mean = novelty.reduce((s, v) => s + v, 0) / novelty.length;
  const variance = novelty.reduce((s, v) => s + (v - mean) ** 2, 0) / novelty.length;
  const threshold = mean + Math.sqrt(variance);

  const candidates: { time: number; novelty: number }[] = [];
  let lastBoundaryTime = 0;
  for (let i = 1; i < novelty.length - 1; i++) {
    if (novelty[i] <= 0 || novelty[i] < threshold) continue;
    const from = Math.max(0, i - PEAK_NEIGHBORHOOD);
    const to = Math.min(novelty.length - 1, i + PEAK_NEIGHBORHOOD);
    const isLocalMax = novelty.slice(from, to + 1).every((v) => v <= novelty[i]);
    if (!isLocalMax) continue;
    if (starts[i] - lastBoundaryTime < MIN_SECTION_SEC) continue;

    candidates.push({ time: starts[i], novelty: novelty[i] });
    lastBoundaryTime = starts[i];
  }

  const capped =
    candidates.length > MAX_BOUNDARIES
      ? [...candidates].sort((a, b) => b.novelty - a.novelty).slice(0, MAX_BOUNDARIES)
      : candidates;

  return capped.map((c) => c.time).sort((a, b) => a - b);
}
