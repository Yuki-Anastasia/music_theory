import { describe, it, expect } from "vitest";
import { analyzeCounterpoint } from "./counterpoint";
import type { NormalizedNoteEvent } from "./normalizedEvents";

function note(midiNote: number, time: number, durationSeconds: number, partLabel?: string): NormalizedNoteEvent {
  return {
    time,
    durationSeconds,
    midiNote,
    pitchClass: ((midiNote % 12) + 12) % 12,
    confidence: 1,
    ...(partLabel ? { partLabel } : {}),
  };
}

describe("analyzeCounterpoint", () => {
  it("returns null when fewer than 2 parts have events", () => {
    const events = [note(60, 0, 1, "Soprano")];
    expect(analyzeCounterpoint(events, ["Soprano"])).toBeNull();
  });

  it("returns null when events have no partLabel at all (audio-transcribed input)", () => {
    const events = [note(60, 0, 1), note(64, 0, 1)];
    expect(analyzeCounterpoint(events, [])).toBeNull();
  });

  it("classifies contrary motion (voices move in opposite directions)", () => {
    const events = [
      note(60, 0, 1, "A"),
      note(50, 0, 1, "B"),
      note(64, 1, 1, "A"), // A: 60 -> 64 (+4)
      note(45, 1, 1, "B"), // B: 50 -> 45 (-5)
    ];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].motionCounts.contrary).toBe(1);
  });

  it("classifies oblique motion (one voice static)", () => {
    const events = [
      note(60, 0, 1, "A"),
      note(50, 0, 1, "B"),
      note(60, 1, 1, "A"), // A stays at 60
      note(53, 1, 1, "B"), // B: 50 -> 53
    ];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].motionCounts.oblique).toBe(1);
  });

  it("classifies similar motion (same direction, different interval)", () => {
    const events = [
      note(60, 0, 1, "A"),
      note(50, 0, 1, "B"), // interval 10
      note(64, 1, 1, "A"), // A: +4
      note(53, 1, 1, "B"), // B: +3, interval 11
    ];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].motionCounts.similar).toBe(1);
  });

  it("classifies parallel motion (same direction, same exact interval) and flags a parallel fifth", () => {
    const events = [
      note(60, 0, 1, "A"),
      note(53, 0, 1, "B"), // interval 7 (perfect fifth)
      note(62, 1, 1, "A"), // A: +2
      note(55, 1, 1, "B"), // B: +2, interval still 7
    ];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].motionCounts.parallel).toBe(1);
    expect(result?.pairs[0].parallelFifthsCount).toBe(1);
    expect(result?.pairs[0].parallelMotionEvents).toEqual([{ time: 1, intervalClass: 7 }]);
  });

  it("flags parallel octaves", () => {
    const events = [
      note(60, 0, 1, "A"),
      note(48, 0, 1, "B"), // interval 12 (octave), class 0
      note(62, 1, 1, "A"),
      note(50, 1, 1, "B"), // interval still 12
    ];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].parallelOctavesCount).toBe(1);
    expect(result?.pairs[0].parallelMotionEvents).toEqual([{ time: 1, intervalClass: 0 }]);
  });

  it("flags a 'hidden' compound parallel fifth (5th -> 12th) that the exact-interval bucket calls 'similar'", () => {
    const events = [
      note(60, 0, 1, "A"),
      note(53, 0, 1, "B"), // interval 7 (perfect fifth)
      note(84, 1, 1, "A"), // A: +24
      note(65, 1, 1, "B"), // B: +12, interval now 19 (a 12th) -> class 19 % 12 = 7
    ];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].motionCounts.similar).toBe(1); // exact interval 7 -> 19 differs
    expect(result?.pairs[0].motionCounts.parallel).toBe(0);
    expect(result?.pairs[0].parallelFifthsCount).toBe(1); // but interval-class pass still catches it
  });

  it("caps included parts at MAX_PARTS=4 while reporting the true part count", () => {
    const events = ["A", "B", "C", "D", "E"].map((label, i) => note(60 + i, 0, 1, label));
    const result = analyzeCounterpoint(events, ["A", "B", "C", "D", "E"]);
    expect(result?.partsAnalyzed).toEqual(["A", "B", "C", "D"]);
    expect(result?.totalPartsFound).toBe(5);
    expect(result?.pairs).toHaveLength(6); // C(4,2)
  });

  it("yields an all-zero, non-crashing stats row for a pair with zero temporal overlap", () => {
    const events = [note(60, 0, 1, "A"), note(50, 5, 1, "B")];
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].verticalityCount).toBe(0);
    expect(result?.pairs[0].motionCounts).toEqual({ contrary: 0, oblique: 0, similar: 0, parallel: 0 });
    expect(result?.pairs[0].motionPercentages).toEqual({ contrary: 0, oblique: 0, similar: 0, parallel: 0 });
  });

  it("caps parallelMotionEvents display list while parallelFifthsCount stays the true total", () => {
    // 26 verticalities (0..25) moving in lockstep by +2 each step, holding
    // interval 7 throughout -> 25 consecutive parallel-fifth transitions.
    const events: NormalizedNoteEvent[] = [];
    for (let i = 0; i <= 25; i++) {
      events.push(note(60 + i * 2, i, 1, "A"));
      events.push(note(53 + i * 2, i, 1, "B"));
    }
    const result = analyzeCounterpoint(events, ["A", "B"]);
    expect(result?.pairs[0].parallelFifthsCount).toBe(25);
    expect(result?.pairs[0].parallelMotionEvents).toHaveLength(20);
  });
});
