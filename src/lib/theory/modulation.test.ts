import { describe, it, expect } from "vitest";
import { classifyKeyRelationship, detectModulations } from "./modulation";
import { estimateKeyTimeline } from "./keyTimeline";
import { NormalizedNoteEvent } from "./normalizedEvents";

function makeScaleEvents(pitchClasses: number[], startTime: number, endTime: number): NormalizedNoteEvent[] {
  const span = endTime - startTime;
  const noteLen = span / pitchClasses.length;
  return pitchClasses.map((pc, i) => ({
    time: startTime + i * noteLen,
    durationSeconds: noteLen,
    midiNote: 60 + pc,
    pitchClass: pc,
    confidence: 1,
  }));
}

describe("classifyKeyRelationship", () => {
  it("classifies a parallel major/minor change (same tonic, mode flips)", () => {
    expect(classifyKeyRelationship({ tonic: 0, mode: "major" }, { tonic: 0, mode: "minor" })).toBe("parallelMajorMinor");
  });

  it("classifies a relative major->minor change (minor tonic 3 semitones below)", () => {
    expect(classifyKeyRelationship({ tonic: 0, mode: "major" }, { tonic: 9, mode: "minor" })).toBe("relativeMajorMinor");
  });

  it("classifies a relative minor->major change (major tonic 3 semitones above)", () => {
    expect(classifyKeyRelationship({ tonic: 9, mode: "minor" }, { tonic: 0, mode: "major" })).toBe("relativeMajorMinor");
  });

  it("classifies a dominant change (+7 semitones, same mode)", () => {
    expect(classifyKeyRelationship({ tonic: 0, mode: "major" }, { tonic: 7, mode: "major" })).toBe("dominant");
  });

  it("classifies a subdominant change (+5 semitones, same mode)", () => {
    expect(classifyKeyRelationship({ tonic: 0, mode: "major" }, { tonic: 5, mode: "major" })).toBe("subdominant");
  });

  it("falls back to 'other' for an unrelated change", () => {
    expect(classifyKeyRelationship({ tonic: 0, mode: "major" }, { tonic: 6, mode: "major" })).toBe("other");
  });
});

describe("detectModulations", () => {
  it("returns no events for a timeline with a single key throughout", () => {
    const cMajor = [0, 2, 4, 5, 7, 9, 11];
    const events: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) events.push(...makeScaleEvents(cMajor, rep * 2, rep * 2 + 2));

    const timeline = estimateKeyTimeline(events, 8, 4);
    expect(detectModulations(timeline, 16)).toEqual([]);
  });

  it("detects a dominant-relationship modulation from C major to G major", () => {
    const cMajor = [0, 2, 4, 5, 7, 9, 11];
    const gMajor = [7, 9, 11, 0, 2, 4, 6];

    const firstHalf: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) firstHalf.push(...makeScaleEvents(cMajor, rep * 2, rep * 2 + 2));
    const secondHalf: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) secondHalf.push(...makeScaleEvents(gMajor, 16 + rep * 2, 16 + rep * 2 + 2));

    const timeline = estimateKeyTimeline([...firstHalf, ...secondHalf], 8, 4);
    const modulations = detectModulations(timeline, 32);

    expect(modulations.length).toBeGreaterThan(0);
    expect(modulations[0]).toMatchObject({ fromTonic: 0, fromMode: "major", toTonic: 7, toMode: "major", relationship: "dominant" });
  });
});
