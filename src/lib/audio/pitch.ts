// Core pitch/frequency math shared across the app.
// A4 = 440Hz = MIDI note 69 (12-tone equal temperament).

export const A4_MIDI = 69;
export const A4_FREQ = 440;

export const PITCH_CLASS_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

/** Equal-temperament frequency for a given MIDI note number. */
export function midiToFrequency(midi: number): number {
  return A4_FREQ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Inverse of midiToFrequency; result is fractional (not rounded to nearest note). */
export function frequencyToMidi(freq: number): number {
  return A4_MIDI + 12 * Math.log2(freq / A4_FREQ);
}

/** Nearest integer MIDI note for a frequency, plus how far off in cents (-50..50). */
export function frequencyToNearestMidi(freq: number): { midi: number; centsOff: number } {
  const exact = frequencyToMidi(freq);
  const midi = Math.round(exact);
  const centsOff = (exact - midi) * 100;
  return { midi, centsOff };
}

export function midiToPitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const pc = midiToPitchClass(rounded);
  const octave = Math.floor(rounded / 12) - 1;
  return `${PITCH_CLASS_NAMES[pc]}${octave}`;
}

/** Cents between two frequencies: 1200 * log2(f2/f1). */
export function centsBetween(f1: number, f2: number): number {
  return 1200 * Math.log2(f2 / f1);
}

// --- Just intonation ratios (relative to a reference/root frequency) ---
export const JUST_RATIOS = {
  unison: 1,
  minorThird: 6 / 5,
  majorThird: 5 / 4,
  perfectFourth: 4 / 3,
  perfectFifth: 3 / 2,
  majorSixth: 5 / 3,
  octave: 2,
} as const;

export function justRatioFrequency(rootFreq: number, ratio: number): number {
  return rootFreq * ratio;
}

/**
 * Standard 5-limit just-intonation approximation for each of the 12
 * equal-tempered interval classes (index = semitones 0-11), in lowest
 * terms [numerator, denominator]. Used by aestheticMetrics.ts to score
 * consonance via Euler's Gradus Suavitatis, which is only defined for
 * rational-number ratios.
 */
export const FIVE_LIMIT_RATIOS_BY_INTERVAL_CLASS: readonly [number, number][] = [
  [1, 1], // unison
  [16, 15], // minor second
  [9, 8], // major second
  [6, 5], // minor third
  [5, 4], // major third
  [4, 3], // perfect fourth
  [45, 32], // tritone
  [3, 2], // perfect fifth
  [8, 5], // minor sixth
  [5, 3], // major sixth
  [16, 9], // minor seventh
  [15, 8], // major seventh
];

/** Equal-temperament ratio for n semitones, e.g. n=7 -> equal-tempered fifth. */
export function equalTemperamentRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}
