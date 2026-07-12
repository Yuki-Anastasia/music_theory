import { describe, it, expect } from "vitest";
import { separateVoices } from "./voiceSeparation";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, durationSeconds: number, midiNote: number): NormalizedNoteEvent {
  return { time, durationSeconds, midiNote, pitchClass: ((midiNote % 12) + 12) % 12, confidence: 1 };
}

describe("separateVoices", () => {
  it("returns empty groups for no events", () => {
    expect(separateVoices([])).toEqual({ melody: [], bass: [], accompaniment: [] });
  });

  it("splits a right-hand tune over a sustained left-hand bass+middle accompaniment", () => {
    // Melody: alternating E5(76)/D#5(75), 0.5s each, over 2s.
    const melodyNotes = [note(0, 0.5, 76), note(0.5, 0.5, 75), note(1, 0.5, 76), note(1.5, 0.5, 75)];
    // Sustained low bass note and a sustained middle accompaniment note for the whole 2s.
    const bassNote = note(0, 2, 45); // A2
    const middleNote = note(0, 2, 60); // C4

    const result = separateVoices([...melodyNotes, bassNote, middleNote]);

    expect(result.melody.map((e) => e.midiNote)).toEqual([76, 75, 76, 75]);
    expect(result.bass.map((e) => e.midiNote)).toEqual([45]);
    expect(result.accompaniment.map((e) => e.midiNote)).toEqual([60]);
  });

  it("treats a solo note (no concurrent notes) as melody", () => {
    const result = separateVoices([note(0, 1, 60)]);
    expect(result.melody).toHaveLength(1);
    expect(result.bass).toHaveLength(0);
  });

  it("falls back to accompaniment for a note shorter than one sample frame", () => {
    // Frame centers are at 0.05, 0.15, ... — a 0.005s note starting at 0 never contains one.
    const result = separateVoices([note(0, 0.005, 60)]);
    expect(result.accompaniment).toHaveLength(1);
    expect(result.melody).toHaveLength(0);
  });
});
