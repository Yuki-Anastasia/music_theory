import { NormalizedNoteEvent } from "./normalizedEvents";

export interface MelodicRange {
  minMidi: number;
  maxMidi: number;
  meanMidi: number;
  rangeSemitones: number;
}

/** Plain min/max/mean tessitura stats over a voice's notes (typically voices.melody from voiceSeparation.ts) — a descriptive statistic, not a judgment of "good" range. */
export function melodicRange(events: NormalizedNoteEvent[]): MelodicRange | null {
  if (events.length === 0) return null;
  const midi = events.map((e) => e.midiNote);
  const minMidi = Math.min(...midi);
  const maxMidi = Math.max(...midi);
  return {
    minMidi,
    maxMidi,
    meanMidi: midi.reduce((s, v) => s + v, 0) / midi.length,
    rangeSemitones: maxMidi - minMidi,
  };
}
