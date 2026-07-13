import { describe, it, expect } from "vitest";
import { findStrongestRecurrence } from "./songForm";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, pitchClass: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.5, midiNote: 60 + pitchClass, pitchClass, confidence: 1 };
}

// Fills [start, start+6) with a repeating C-E-G arpeggio -- a distinctive,
// consistent pitch-class distribution to match against.
function fillRepeatingPattern(events: NormalizedNoteEvent[], start: number): void {
  for (let i = 0; i < 12; i++) events.push(note(start + i * 0.5, [0, 4, 7][i % 3]));
}

// Fills [start, start+6) with different, unrelated material each call.
function fillDistinctMaterial(events: NormalizedNoteEvent[], start: number, pitchClasses: number[]): void {
  for (let i = 0; i < 12; i++) events.push(note(start + i * 0.5, pitchClasses[i % pitchClasses.length]));
}

describe("findStrongestRecurrence", () => {
  it("returns null when nothing recurs", () => {
    const events: NormalizedNoteEvent[] = [];
    fillDistinctMaterial(events, 0, [0, 2, 4]);
    fillDistinctMaterial(events, 6, [1, 6, 9]);
    fillDistinctMaterial(events, 12, [3, 8, 10]);
    expect(findStrongestRecurrence(events, 18)).toBeNull();
  });

  it("finds a far-apart window pair with matching pitch-class content", () => {
    const events: NormalizedNoteEvent[] = [];
    fillRepeatingPattern(events, 0); // [0,6)
    fillDistinctMaterial(events, 6, [1, 6, 9]);
    fillDistinctMaterial(events, 12, [3, 8, 10]);
    fillDistinctMaterial(events, 18, [5, 11, 2]);
    fillRepeatingPattern(events, 24); // [24,30) -- recurs

    const match = findStrongestRecurrence(events, 30);
    expect(match).not.toBeNull();
    expect(match).toMatchObject({ a: { startSec: 0, endSec: 6 }, b: { startSec: 24, endSec: 30 } });
    expect(match!.similarity).toBeGreaterThan(0.9);
  });
});
