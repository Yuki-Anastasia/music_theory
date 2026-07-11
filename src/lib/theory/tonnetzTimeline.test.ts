import { describe, it, expect } from "vitest";
import { estimateTonnetzTrajectory } from "./tonnetzTimeline";
import { NormalizedNoteEvent } from "./normalizedEvents";

function chordEvents(pitchClasses: number[], startTime: number, endTime: number): NormalizedNoteEvent[] {
  return pitchClasses.map((pc) => ({
    time: startTime,
    durationSeconds: endTime - startTime,
    midiNote: 60 + pc,
    pitchClass: pc,
    confidence: 1,
  }));
}

describe("estimateTonnetzTrajectory", () => {
  it("returns an empty trajectory for no events", () => {
    expect(estimateTonnetzTrajectory([])).toEqual([]);
  });

  it("detects a C -> F -> G -> C progression in order", () => {
    const events: NormalizedNoteEvent[] = [
      ...chordEvents([0, 4, 7], 0, 2), // C major
      ...chordEvents([5, 9, 0], 2, 4), // F major
      ...chordEvents([7, 11, 2], 4, 6), // G major
      ...chordEvents([0, 4, 7], 6, 8), // C major
    ];

    const trajectory = estimateTonnetzTrajectory(events, 2, 2);
    const sequence = trajectory.map((p) => `${p.chord.root}${p.chord.mode === "major" ? "M" : "m"}`);
    expect(sequence).toEqual(["0M", "5M", "7M", "0M"]);
  });

  it("collapses consecutive identical chords into a single point", () => {
    const events = chordEvents([0, 4, 7], 0, 10); // C major sustained for 10s
    const trajectory = estimateTonnetzTrajectory(events, 2, 1);
    expect(trajectory).toHaveLength(1);
    expect(trajectory[0].chord.root).toBe(0);
    expect(trajectory[0].chord.mode).toBe("major");
  });
});
