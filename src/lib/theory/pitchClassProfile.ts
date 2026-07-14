export type ScaleName =
  | "major"
  | "naturalMinor"
  | "harmonicMinor"
  | "dorian"
  | "mixolydian"
  | "majorPentatonic"
  | "minorPentatonic"
  | "blues"
  | "wholeTone";

interface ScaleTemplate {
  name: ScaleName;
  intervals: number[];
}

// Ordered smallest-first, since estimateScaleFit prefers the most specific
// (fewest-note) template that still explains the histogram -- a 5-note
// pentatonic reading is strictly more informative than the 7-note major
// scale that trivially contains it, so ties favor specificity.
const SCALE_TEMPLATES: ScaleTemplate[] = [
  { name: "majorPentatonic", intervals: [0, 2, 4, 7, 9] },
  { name: "minorPentatonic", intervals: [0, 3, 5, 7, 10] },
  { name: "blues", intervals: [0, 3, 5, 6, 7, 10] },
  { name: "wholeTone", intervals: [0, 2, 4, 6, 8, 10] },
  { name: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: "naturalMinor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: "harmonicMinor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: "dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: "mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
];

// A candidate at or above this coverage is treated as "the material fits
// this scale" (a little slack for passing/chromatic tones); below it, the
// best-covering candidate is still reported but flagged low-confidence.
const HIGH_COVERAGE_THRESHOLD = 0.97;

export interface PitchClassShare {
  pitchClass: number;
  share: number; // 0-1 of the histogram's total weighted duration
}

/** Pitch classes actually present, sorted by share descending -- the same histogram already computed for key/chord detection, just read out as a ranked breakdown instead of consumed as a correlation input. */
export function pitchClassDistribution(histogram: number[]): PitchClassShare[] {
  const total = histogram.reduce((s, v) => s + v, 0);
  if (total === 0) return [];
  return histogram
    .map((value, pitchClass) => ({ pitchClass, share: value / total }))
    .filter((p) => p.share > 0)
    .sort((a, b) => b.share - a.share);
}

export interface ScaleFitEstimate {
  root: number;
  scaleName: ScaleName;
  pitchClasses: number[]; // absolute pitch classes, ascending
  coverage: number;
  confidence: "high" | "low";
}

/**
 * Best-fitting named scale for a pitch-class histogram, scored the same way
 * tonnetz.ts's detectChord scores triads: coverage = fraction of the
 * histogram's weighted duration whose pitch class falls inside the
 * template. Unlike detectChord, candidate templates are nested (e.g. minor
 * pentatonic is a subset of natural minor), so picking the single highest
 * coverage would always favor the larger scale trivially. Instead, among
 * candidates clearing HIGH_COVERAGE_THRESHOLD, the smallest (most specific)
 * one wins -- the same "prefer the more falsifiable explanation" logic as
 * Occam's razor, and it's what lets "E minor pentatonic" surface instead of
 * the technically-also-true-but-less-informative "E natural minor".
 *
 * Relative major/minor pentatonic scales (e.g. G major pentatonic and E
 * minor pentatonic) share the exact same pitch-class set, so coverage alone
 * can't break that tie -- the final tiebreak is which candidate's root
 * itself carries the most individual weight in the histogram, i.e. which
 * note is actually being treated as "home".
 */
export function estimateScaleFit(histogram: number[]): ScaleFitEstimate | null {
  const total = histogram.reduce((s, v) => s + v, 0);
  if (total === 0) return null;

  const candidates = SCALE_TEMPLATES.flatMap((template) =>
    Array.from({ length: 12 }, (_, root) => {
      const pitchClasses = template.intervals.map((iv) => (root + iv) % 12).sort((a, b) => a - b);
      const coverage = pitchClasses.reduce((s, pc) => s + histogram[pc], 0) / total;
      return { root, scaleName: template.name, pitchClasses, coverage, size: template.intervals.length };
    })
  );

  const highCoverage = candidates.filter((c) => c.coverage >= HIGH_COVERAGE_THRESHOLD);
  if (highCoverage.length > 0) {
    highCoverage.sort((a, b) => a.size - b.size || b.coverage - a.coverage || histogram[b.root] - histogram[a.root]);
    const best = highCoverage[0];
    return { root: best.root, scaleName: best.scaleName, pitchClasses: best.pitchClasses, coverage: best.coverage, confidence: "high" };
  }

  const best = [...candidates].sort((a, b) => b.coverage - a.coverage)[0];
  return { root: best.root, scaleName: best.scaleName, pitchClasses: best.pitchClasses, coverage: best.coverage, confidence: "low" };
}
