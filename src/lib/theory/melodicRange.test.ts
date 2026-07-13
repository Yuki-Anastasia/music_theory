import { describe, it, expect } from "vitest";
import { melodicRange } from "./melodicRange";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(midiNote: number, time = 0): NormalizedNoteEvent {
  return { time, durationSeconds: 0.5, midiNote, pitchClass: midiNote % 12, confidence: 1 };
}

describe("melodicRange", () => {
  it("returns null for no events", () => {
    expect(melodicRange([])).toBeNull();
  });

  it("returns zero range for a single note", () => {
    expect(melodicRange([note(60)])).toEqual({ minMidi: 60, maxMidi: 60, meanMidi: 60, rangeSemitones: 0 });
  });

  it("computes min/max/mean across a spread of notes", () => {
    const result = melodicRange([note(60), note(64), note(72)]);
    expect(result).toEqual({ minMidi: 60, maxMidi: 72, meanMidi: (60 + 64 + 72) / 3, rangeSemitones: 12 });
  });
});
