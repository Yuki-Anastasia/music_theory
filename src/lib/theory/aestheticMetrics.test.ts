import { describe, it, expect } from "vitest";
import {
  eulerGradusSuavitatis,
  intervalGradusSuavitatis,
  consonanceOfHistogram,
  voiceLeadingDistance,
  harmonicTensionOfTrajectory,
  buildPitchClassTransitionMatrix,
  conditionalPitchEntropy,
  melodicSelfSimilarity,
  generateMarkovSequence,
} from "./aestheticMetrics";
import { NormalizedNoteEvent } from "./normalizedEvents";
import { TonnetzTimelinePoint } from "./tonnetzTimeline";

function note(time: number, pitchClass: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.4, midiNote: 60 + pitchClass, pitchClass, confidence: 1 };
}

describe("eulerGradusSuavitatis", () => {
  it("matches hand-derived values for known ratios (D-1 style check)", () => {
    expect(eulerGradusSuavitatis(1)).toBe(1); // unison 1:1
    expect(eulerGradusSuavitatis(2)).toBe(2); // octave 2:1
    expect(eulerGradusSuavitatis(6)).toBe(4); // fifth 3:2 -> product 6
    expect(eulerGradusSuavitatis(12)).toBe(5); // fourth 4:3 -> product 12
    expect(eulerGradusSuavitatis(20)).toBe(7); // major third 5:4 -> product 20
  });
});

describe("intervalGradusSuavitatis", () => {
  it("ranks the fifth as more consonant than the minor second", () => {
    const fifth = intervalGradusSuavitatis(7);
    const minorSecond = intervalGradusSuavitatis(1);
    expect(fifth).toBe(4);
    expect(fifth).toBeLessThan(minorSecond);
  });

  it("gives the unison the lowest possible gradus", () => {
    expect(intervalGradusSuavitatis(0)).toBe(1);
  });
});

describe("consonanceOfHistogram", () => {
  it("scores a root+fifth dyad using the fifth's gradus", () => {
    const histogram = new Array(12).fill(0);
    histogram[0] = 1;
    histogram[7] = 1;
    const { averageGradus, consonanceScore } = consonanceOfHistogram(histogram);
    expect(averageGradus).toBe(4);
    expect(consonanceScore).toBeCloseTo(0.25, 10);
  });

  it("returns zero for an empty histogram rather than dividing by zero", () => {
    expect(consonanceOfHistogram(new Array(12).fill(0))).toEqual({ averageGradus: 0, consonanceScore: 0 });
  });

  it("scores a dissonant dyad worse than a consonant one", () => {
    const fifthDyad = new Array(12).fill(0);
    fifthDyad[0] = 1;
    fifthDyad[7] = 1;
    const minorSecondDyad = new Array(12).fill(0);
    minorSecondDyad[0] = 1;
    minorSecondDyad[1] = 1;
    expect(consonanceOfHistogram(fifthDyad).averageGradus).toBeLessThan(
      consonanceOfHistogram(minorSecondDyad).averageGradus
    );
  });
});

describe("voiceLeadingDistance", () => {
  it("is zero between a triad and itself", () => {
    expect(voiceLeadingDistance({ root: 0, mode: "major" }, { root: 0, mode: "major" })).toBe(0);
  });

  it("finds the minimal 2-semitone move from C major to its relative minor (A minor)", () => {
    expect(voiceLeadingDistance({ root: 0, mode: "major" }, { root: 9, mode: "minor" })).toBe(2);
  });
});

describe("harmonicTensionOfTrajectory", () => {
  it("returns zeros for a trajectory shorter than 2 points", () => {
    expect(harmonicTensionOfTrajectory([])).toEqual({ averageVoiceLeadingDistance: 0, maxVoiceLeadingDistance: 0 });
  });

  it("averages voice-leading distance across consecutive chords", () => {
    const trajectory: TonnetzTimelinePoint[] = [
      { time: 0, chord: { root: 0, mode: "major", coverage: 1, confidence: "high" } },
      { time: 1, chord: { root: 9, mode: "minor", coverage: 1, confidence: "high" } },
    ];
    expect(harmonicTensionOfTrajectory(trajectory)).toEqual({
      averageVoiceLeadingDistance: 2,
      maxVoiceLeadingDistance: 2,
    });
  });
});

describe("conditionalPitchEntropy", () => {
  it("is zero for a fully deterministic alternation", () => {
    const events = [note(0, 0), note(1, 7), note(2, 0), note(3, 7)];
    expect(conditionalPitchEntropy(events).conditionalEntropyBits).toBe(0);
  });

  it("matches a hand-derived value when one pitch class has two equally likely successors", () => {
    // Sequence 0,2,0,4: from pc0, two transitions (->2, ->4), 1 bit of row entropy,
    // weighted by p(from 0) = 2/3 of all 3 transitions -> 2/3 bit total.
    const events = [note(0, 0), note(1, 2), note(2, 0), note(3, 4)];
    expect(conditionalPitchEntropy(events).conditionalEntropyBits).toBeCloseTo(2 / 3, 10);
  });

  it("reports the theoretical maximum as log2(12)", () => {
    expect(conditionalPitchEntropy([note(0, 0)]).maxEntropyBits).toBeCloseTo(Math.log2(12), 10);
  });
});

describe("melodicSelfSimilarity", () => {
  it("detects a period-3 repeating motif", () => {
    const pitchClasses = [0, 4, 7, 0, 4, 7, 0, 4, 7, 0, 4, 7];
    const events = pitchClasses.map((pc, i) => note(i, pc));
    const { bestLagNotes, correlation } = melodicSelfSimilarity(events);
    expect(bestLagNotes).toBe(3);
    expect(correlation).toBeCloseTo(0.75, 10);
  });

  it("returns a neutral result for too few notes", () => {
    expect(melodicSelfSimilarity([note(0, 0), note(1, 4)])).toEqual({ bestLagNotes: 0, correlation: 0 });
  });
});

describe("buildPitchClassTransitionMatrix + generateMarkovSequence", () => {
  it("generates only pitch classes that were observed as transitions in the source", () => {
    const events = [note(0, 0), note(1, 2), note(2, 0), note(3, 4)];
    const matrix = buildPitchClassTransitionMatrix(events);
    const sequence = generateMarkovSequence(matrix, 0, 20, () => 0.99); // always picks the last nonzero option in the row
    expect(sequence.every((pc) => [0, 2, 4].includes(pc))).toBe(true);
  });

  it("is deterministic for a fixed rng", () => {
    const events = [note(0, 0), note(1, 2), note(2, 0), note(3, 4)];
    const matrix = buildPitchClassTransitionMatrix(events);
    const a = generateMarkovSequence(matrix, 0, 10, () => 0.1);
    const b = generateMarkovSequence(matrix, 0, 10, () => 0.1);
    expect(a).toEqual(b);
  });
});
