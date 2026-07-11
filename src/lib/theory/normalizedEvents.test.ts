import { describe, it, expect } from "vitest";
import type { NoteEventTime } from "@spotify/basic-pitch";
import { notesToNormalizedEvents, pitchClassHistogram, activePitchClassesAt } from "./normalizedEvents";

function note(pitchMidi: number, startTimeSeconds: number, durationSeconds: number, amplitude = 1): NoteEventTime {
  return { pitchMidi, startTimeSeconds, durationSeconds, amplitude };
}

describe("notesToNormalizedEvents", () => {
  it("maps Basic Pitch NoteEventTime fields to the common normalized format", () => {
    const notes = [note(60, 1.5, 0.5, 0.8)]; // MIDI 60 = C4, pitch class 0
    const [event] = notesToNormalizedEvents(notes);
    expect(event).toEqual({
      time: 1.5,
      durationSeconds: 0.5,
      midiNote: 60,
      pitchClass: 0,
      confidence: 0.8,
    });
  });

  it("clamps confidence to 0-1 even if amplitude is out of range", () => {
    const [event] = notesToNormalizedEvents([note(60, 0, 1, 1.5)]);
    expect(event.confidence).toBe(1);
  });
});

describe("pitchClassHistogram", () => {
  it("weights each pitch class by overlapping duration within the window", () => {
    const events = notesToNormalizedEvents([
      note(60, 0, 2, 1), // C, sounds 0-2s
      note(64, 1, 2, 1), // E, sounds 1-3s
    ]);
    // window [0, 2): C overlaps fully (2s), E overlaps [1,2) = 1s
    const histogram = pitchClassHistogram(events, 0, 2);
    expect(histogram[0]).toBeCloseTo(2, 6); // C
    expect(histogram[4]).toBeCloseTo(1, 6); // E
    expect(histogram.filter((v) => v > 0)).toHaveLength(2);
  });

  it("returns all zeros when no notes overlap the window", () => {
    const events = notesToNormalizedEvents([note(60, 10, 1, 1)]);
    const histogram = pitchClassHistogram(events, 0, 2);
    expect(histogram).toEqual(new Array(12).fill(0));
  });
});

describe("activePitchClassesAt", () => {
  it("returns pitch classes sounding at the given instant", () => {
    const events = notesToNormalizedEvents([
      note(60, 0, 2, 1), // C, 0-2s
      note(67, 1, 1, 1), // G, 1-2s
    ]);
    expect(activePitchClassesAt(events, 0.5)).toEqual(new Set([0]));
    expect(activePitchClassesAt(events, 1.5)).toEqual(new Set([0, 7]));
    expect(activePitchClassesAt(events, 3)).toEqual(new Set());
  });
});
