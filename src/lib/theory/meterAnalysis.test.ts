import { describe, it, expect } from "vitest";
import { analyzeMeter, describeBeatWeights } from "./meterAnalysis";
import type { MeterPoint } from "../score/musicXml";
import type { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.1, midiNote: 60, pitchClass: 0, confidence: 1 };
}

describe("describeBeatWeights", () => {
  it("weights 4/4 as strong-weak-medium-weak", () => {
    expect(describeBeatWeights(4, 4).map((b) => b.strength)).toEqual(["strong", "weak", "medium", "weak"]);
  });

  it("weights 3/4 as strong-weak-weak", () => {
    expect(describeBeatWeights(3, 4).map((b) => b.strength)).toEqual(["strong", "weak", "weak"]);
  });

  it("weights 6/8 (compound) as two groups of three, each with a group-downbeat", () => {
    expect(describeBeatWeights(6, 8).map((b) => b.strength)).toEqual([
      "strong",
      "weak",
      "weak",
      "medium",
      "weak",
      "weak",
    ]);
  });

  it("falls back to downbeat-only for an irregular meter (5/4)", () => {
    expect(describeBeatWeights(5, 4).map((b) => b.strength)).toEqual(["strong", "weak", "weak", "weak", "weak"]);
  });
});

describe("analyzeMeter", () => {
  it("returns null when meterTimeline is empty (audio-transcribed input)", () => {
    expect(analyzeMeter([note(0), note(1)], [], 4)).toBeNull();
  });

  it("returns null when there are no events and no percussion onsets", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    expect(analyzeMeter([], meterTimeline, 4)).toBeNull();
  });

  it("runs on percussion onsets alone (a drum-only score, no pitched parts)", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const result = analyzeMeter([], meterTimeline, 4, [], [], [0, 1, 2, 3]);
    expect(result).not.toBeNull();
    expect(result?.syncopation.pairCount).toBe(3);
  });

  it("finds zero syncopation for an isochronous on-the-beat quarter-note stream in 4/4", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const events = [note(0), note(1), note(2), note(3)];

    const result = analyzeMeter(events, meterTimeline, 4);

    expect(result?.syncopation.rawScore).toBe(0);
    expect(result?.syncopation.normalizedScore).toBe(0);
    expect(result?.syncopation.pairCount).toBe(3);
  });

  it("finds positive syncopation for a note on the 8th-note 'and' held through a stronger beat", () => {
    // 4/4, single 4s bar -> 16 slots of 0.25s. Onset at 0.5s (the "and" of
    // beat 0, weight -1) is held until the next onset at 2.5s, which is
    // past beat 2 (t=2.0s, weight 2 "medium") -> contribution 2-(-1)=3.
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const events = [note(0.5), note(2.5)];

    const result = analyzeMeter(events, meterTimeline, 4);

    expect(result?.syncopation.pairCount).toBe(1);
    expect(result?.syncopation.rawScore).toBeCloseTo(3);
    expect(result?.syncopation.maxPossibleScore).toBe(5); // 1 pair * (3 - (-2))
    expect(result?.syncopation.normalizedScore).toBeCloseTo(0.6);
  });

  it("walks across a bar boundary when a held note spans two bars", () => {
    // Two 4/4 bars of 2s each (0-2, 2-4) -> 0.125s slots. Onset at 1.75s
    // (bar 0, subSlot 2 -> weight -1) held until 2.5s (bar 1), passing
    // through the bar-1 downbeat at t=2.0s (weight 3) -> contribution
    // 3-(-1)=4.
    const meterTimeline: MeterPoint[] = [
      { time: 0, numerator: 4, denominator: 4 },
      { time: 2, numerator: 4, denominator: 4 },
    ];
    const events = [note(1.75), note(2.5)];

    const result = analyzeMeter(events, meterTimeline, 4);

    expect(result?.syncopation.pairCount).toBe(1);
    expect(result?.syncopation.rawScore).toBeCloseTo(4);
  });

  it("prefers notatedChordTimeline over tonnetzTrajectory for harmonic rhythm alignment", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const events = [note(0), note(1)];
    const tonnetzTrajectory = [{ time: 0.5, chord: { root: 0, mode: "major" as const, coverage: 1, confidence: "high" as const } }];
    const notatedChordTimeline = [{ time: 0, label: "C" }];

    const result = analyzeMeter(events, meterTimeline, 4, tonnetzTrajectory, notatedChordTimeline);

    expect(result?.harmonicRhythmAlignment?.source).toBe("notatedChords");
    expect(result?.harmonicRhythmAlignment?.totalChordChanges).toBe(1);
  });

  it("falls back to tonnetzTrajectory when there's no notated chord timeline", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const events = [note(0), note(1)];
    const tonnetzTrajectory = [{ time: 0, chord: { root: 0, mode: "major" as const, coverage: 1, confidence: "high" as const } }];

    const result = analyzeMeter(events, meterTimeline, 4, tonnetzTrajectory, []);

    expect(result?.harmonicRhythmAlignment?.source).toBe("detectedChords");
  });

  it("leaves harmonicRhythmAlignment null when neither chord source is available", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const result = analyzeMeter([note(0)], meterTimeline, 4, [], []);
    expect(result?.harmonicRhythmAlignment).toBeNull();
  });

  it("collapses meterSummary to only the actual signature-change points", () => {
    const meterTimeline: MeterPoint[] = [
      { time: 0, numerator: 4, denominator: 4 },
      { time: 2, numerator: 4, denominator: 4 }, // same signature, should not appear separately
      { time: 4, numerator: 3, denominator: 4 },
    ];
    const result = analyzeMeter([note(0)], meterTimeline, 6);

    expect(result?.meterSummary.map((p) => ({ time: p.time, numerator: p.numerator, denominator: p.denominator }))).toEqual([
      { time: 0, numerator: 4, denominator: 4 },
      { time: 4, numerator: 3, denominator: 4 },
    ]);
  });

  it("folds percussion onsets into the same syncopation calculation as pitched onsets", () => {
    // Identical setup to the "8th-note and held through a stronger beat"
    // case above, but the onsets come from percussionOnsets instead of
    // pitched events (events is empty) — the math should be identical.
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    const result = analyzeMeter([], meterTimeline, 4, [], [], [0.5, 2.5]);

    expect(result?.syncopation.pairCount).toBe(1);
    expect(result?.syncopation.rawScore).toBeCloseTo(3);
    expect(result?.syncopation.normalizedScore).toBeCloseTo(0.6);
  });

  it("merges pitched-event onsets and percussion onsets into one deduplicated stream", () => {
    const meterTimeline: MeterPoint[] = [{ time: 0, numerator: 4, denominator: 4 }];
    // A guitar note at 0.5s and a kick drum at the same instant (0.5s)
    // should collapse to a single onset, plus the drum's later hit at 2.5s.
    const result = analyzeMeter([note(0.5)], meterTimeline, 4, [], [], [0.5, 2.5]);

    expect(result?.syncopation.pairCount).toBe(1); // 2 distinct onsets -> 1 pair, not 2
  });
});
