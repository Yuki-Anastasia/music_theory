import { describe, it, expect } from "vitest";
import { analyzeInstrumentBuildUp, PERCUSSION_PART_LABEL } from "./instrumentDensity";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, partLabel: string): NormalizedNoteEvent {
  return { time, durationSeconds: 0.2, midiNote: 60, pitchClass: 0, confidence: 1, partLabel };
}

describe("analyzeInstrumentBuildUp", () => {
  it("returns null when no events have a partLabel and there's no percussion", () => {
    const events: NormalizedNoteEvent[] = [{ time: 0, durationSeconds: 0.2, midiNote: 60, pitchClass: 0, confidence: 1 }];
    expect(analyzeInstrumentBuildUp(events, [], 8)).toBeNull();
  });

  it("returns null for a zero-length song", () => {
    expect(analyzeInstrumentBuildUp([note(0, "Guitar")], [], 0)).toBeNull();
  });

  it("tracks each part's first active segment across an 8-segment song", () => {
    // 8-second song -> 1s segments. Guitar plays throughout; Bass only enters at t=4 (segment 4).
    const events: NormalizedNoteEvent[] = [
      note(0, "Guitar"),
      note(1, "Guitar"),
      note(4, "Guitar"),
      note(4, "Bass"),
      note(5, "Bass"),
    ];
    const buildUp = analyzeInstrumentBuildUp(events, [], 8);
    expect(buildUp).not.toBeNull();
    const guitar = buildUp!.parts.find((p) => p.partLabel === "Guitar")!;
    const bass = buildUp!.parts.find((p) => p.partLabel === "Bass")!;
    expect(guitar.firstActiveSegment).toBe(0);
    expect(bass.firstActiveSegment).toBe(4);
    expect(guitar.countsBySegment[0]).toBe(1);
    expect(guitar.countsBySegment[4]).toBe(1);
    expect(bass.countsBySegment[4]).toBe(1);
    expect(bass.countsBySegment[5]).toBe(1);
  });

  it("reports percussion (no partLabel) as its own pseudo-part when present", () => {
    const buildUp = analyzeInstrumentBuildUp([note(0, "Guitar")], [2, 2.5, 6], 8);
    const percussion = buildUp!.parts.find((p) => p.partLabel === PERCUSSION_PART_LABEL);
    expect(percussion).toBeDefined();
    expect(percussion!.firstActiveSegment).toBe(2);
    expect(percussion!.countsBySegment[2]).toBe(2);
    expect(percussion!.countsBySegment[6]).toBe(1);
  });
});
