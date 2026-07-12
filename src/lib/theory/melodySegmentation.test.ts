import { describe, it, expect } from "vitest";
import { detectMelodyBoundaries } from "./melodySegmentation";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, pitchClass: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.5, midiNote: 60 + pitchClass, pitchClass, confidence: 1 };
}

describe("detectMelodyBoundaries", () => {
  it("finds a boundary where the melodic pattern changes", () => {
    // 0-8s: cycling C-D-E (pitch classes 0,2,4). 8-16s: cycling G-A-B (7,9,11).
    const events: NormalizedNoteEvent[] = [];
    for (let i = 0; i < 16; i++) events.push(note(i * 0.5, [0, 2, 4][i % 3]));
    for (let i = 0; i < 16; i++) events.push(note(8 + i * 0.5, [7, 9, 11][i % 3]));

    const boundaries = detectMelodyBoundaries(events, 16);
    expect(boundaries.length).toBeGreaterThan(0);
    expect(boundaries[0]).toBeGreaterThanOrEqual(5);
    expect(boundaries[0]).toBeLessThanOrEqual(8);
  });

  it("returns no boundaries for a melody with no internal shift", () => {
    const events: NormalizedNoteEvent[] = [];
    for (let i = 0; i < 32; i++) events.push(note(i * 0.5, [0, 2, 4][i % 3]));
    expect(detectMelodyBoundaries(events, 16)).toEqual([]);
  });

  it("returns no boundaries when the song is shorter than one analysis window", () => {
    const events = [note(0, 0), note(1, 4)];
    expect(detectMelodyBoundaries(events, 2)).toEqual([]);
  });

  it("returns an empty array for no events", () => {
    expect(detectMelodyBoundaries([], 30)).toEqual([]);
  });
});
