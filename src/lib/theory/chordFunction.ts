import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { KeyTimelinePoint } from "./keyTimeline";
import { keyActiveAt } from "./keyTimeline";
import type { TriadMode } from "./tonnetz";
import type { Mode } from "./keyProfile";
import { semitonesUp } from "./modulation";

export interface ChordFunctionPoint {
  time: number;
  root: number;
  chordMode: TriadMode;
  keyTonic: number;
  keyMode: Mode;
  romanNumeral: string; // e.g. "I", "ii", "V", "bVII"
}

const DEGREE_ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // natural minor

/**
 * Labels a chromatic (non-diatonic) root relative to the nearest diatonic
 * step ABOVE it, flattened -- e.g. offset 10 in a major key is 1 semitone
 * below step 11 ("VII") -> "bVII". Natural minor's raised-7th gap leaves
 * offset 11 with no diatonic step above it (the "next" step wraps to the
 * octave's tonic, and flattening the tonic ("bI") would be nonsensical) --
 * that one case is spelled as a sharp of the top step instead ("#VII").
 */
function chromaticLabel(offset: number, steps: number[]): string {
  const nextIndex = steps.findIndex((step) => step > offset);
  if (nextIndex === -1) return `#${DEGREE_ROMAN[steps.length - 1]}`;
  return `b${DEGREE_ROMAN[nextIndex]}`;
}

/**
 * Labels a chord's root by scale-degree position within the active key,
 * using the DETECTED triad quality's case (upper = major, lower = minor)
 * -- not a comparison against the "expected" diatonic quality. This
 * sidesteps needing true diminished-chord detection: tonnetz.ts's
 * ChordEstimate only distinguishes major/minor, so a minor triad landing on
 * a major key's diatonic 7th degree renders "vii", not the theoretically
 * "correct" "vii°" -- a documented simplification, not an oversight.
 */
export function romanNumeralFor(root: number, chordMode: TriadMode, keyTonic: number, keyMode: Mode): string {
  const offset = semitonesUp(keyTonic, root);
  const steps = keyMode === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const exactIndex = steps.indexOf(offset);
  const base = exactIndex >= 0 ? DEGREE_ROMAN[exactIndex] : chromaticLabel(offset, steps);
  return chordMode === "major" ? base : base.toLowerCase();
}

/** Pairs each detected chord with the key active at its time (via keyActiveAt) and labels its function. Chords before the first key-timeline point (no active key yet) are dropped, not defaulted to some assumed key. */
export function analyzeChordFunctions(
  tonnetzTrajectory: TonnetzTimelinePoint[],
  keyTimeline: KeyTimelinePoint[]
): ChordFunctionPoint[] {
  const points: ChordFunctionPoint[] = [];
  for (const chordPoint of tonnetzTrajectory) {
    const key = keyActiveAt(keyTimeline, chordPoint.time);
    if (!key) continue;
    points.push({
      time: chordPoint.time,
      root: chordPoint.chord.root,
      chordMode: chordPoint.chord.mode,
      keyTonic: key.tonic,
      keyMode: key.mode,
      romanNumeral: romanNumeralFor(chordPoint.chord.root, chordPoint.chord.mode, key.tonic, key.mode),
    });
  }
  return points;
}
