import { describe, it, expect } from "vitest";
import { estimateSongArc } from "./songArc";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, pitchClass: number, confidence = 1, durationSeconds = 0.5): NormalizedNoteEvent {
  return { time, durationSeconds, midiNote: 60 + pitchClass, pitchClass, confidence };
}

describe("estimateSongArc", () => {
  it("returns an empty arc for no events", () => {
    expect(estimateSongArc([], [], [], [], 120, 0)).toEqual([]);
  });

  it("splits at a melodic pattern change and captures the shift in consonance/dynamics", () => {
    // Melody cycles C-D-E for 0-8s, then G-A-B for 8-16s -> a boundary near t=6-8.
    const melodyEvents: NormalizedNoteEvent[] = [];
    for (let i = 0; i < 16; i++) melodyEvents.push(note(i * 0.5, [0, 2, 4][i % 3]));
    for (let i = 0; i < 16; i++) melodyEvents.push(note(8 + i * 0.5, [7, 9, 11][i % 3]));

    // Full texture: quiet perfect-fifth dyad (Gradus 4) in the first half,
    // loud minor-second dyad (Gradus 11) in the second half.
    const events: NormalizedNoteEvent[] = [
      note(0, 0, 0.2, 4),
      note(0, 7, 0.2, 4),
      note(4, 0, 0.2, 4),
      note(4, 7, 0.2, 4),
      note(8, 0, 0.9, 4),
      note(8, 1, 0.9, 4),
      note(12, 0, 0.9, 4),
      note(12, 1, 0.9, 4),
    ];

    const sections = estimateSongArc(events, melodyEvents, [], [], 120, 16);
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const first = sections[0];
    const last = sections[sections.length - 1];
    expect(first.startSec).toBe(0);
    expect(last.endSec).toBe(16);
    expect(first.consonance.averageGradus).toBeLessThan(last.consonance.averageGradus);
    expect(first.dynamics.averageLoudness).toBeLessThan(last.dynamics.averageLoudness);
  });

  it("returns a single section for a melody with no detected internal shift", () => {
    const melodyEvents: NormalizedNoteEvent[] = [];
    for (let i = 0; i < 32; i++) melodyEvents.push(note(i * 0.5, [0, 2, 4][i % 3]));
    const events = melodyEvents;

    const sections = estimateSongArc(events, melodyEvents, [], [], 120, 16);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ startSec: 0, endSec: 16 });
  });
});
