import { describe, it, expect } from "vitest";
import { matchRange, matchDirection, matchCategorical, matchKeywordMatch, computeMatch } from "./matching";
import type { FeatureExpectation } from "./conceptTypes";
import type { FeatureSample } from "./featureSample";

describe("matchRange", () => {
  it("returns 1 for a value inside the target range", () => {
    expect(matchRange(140, [120, 160])).toBe(1);
    expect(matchRange(120, [120, 160])).toBe(1); // inclusive edges
    expect(matchRange(160, [120, 160])).toBe(1);
  });

  it("falls off linearly to 0 at one range-width beyond the edge (default softness)", () => {
    // range width = 40; one width below min (120) is 80 -> 0
    expect(matchRange(80, [120, 160])).toBeCloseTo(0, 5);
    // halfway to that point (100) -> 0.5
    expect(matchRange(100, [120, 160])).toBeCloseTo(0.5, 5);
    // symmetric on the upper side
    expect(matchRange(200, [120, 160])).toBeCloseTo(0, 5);
    expect(matchRange(180, [120, 160])).toBeCloseTo(0.5, 5);
  });

  it("clamps to 0 beyond the falloff distance rather than going negative", () => {
    expect(matchRange(0, [120, 160])).toBe(0);
  });

  it("respects a custom softness", () => {
    // softness 2 -> falloff distance = 80; 40 below min (80) is halfway -> 0.5
    expect(matchRange(80, [120, 160], 2)).toBeCloseTo(0.5, 5);
  });
});

describe("matchDirection", () => {
  it("matches the plan's hand-computed fixture: bipolar 0.8, positive direction -> 0.9", () => {
    expect(matchDirection(0.8, "positive", "bipolar")).toBeCloseTo(0.9, 5);
  });

  it("inverts for the opposite direction", () => {
    expect(matchDirection(0.8, "negative", "bipolar")).toBeCloseTo(0.1, 5);
  });

  it("handles negative bipolar values", () => {
    expect(matchDirection(-0.8, "positive", "bipolar")).toBeCloseTo(0.1, 5);
    expect(matchDirection(-0.8, "negative", "bipolar")).toBeCloseTo(0.9, 5);
  });

  it("rescales unit (0-1) values to bipolar before matching", () => {
    // unit 0.9 -> bipolar 0.8, same as the fixture above
    expect(matchDirection(0.9, "positive", "unit")).toBeCloseTo(0.9, 5);
    expect(matchDirection(0.1, "positive", "unit")).toBeCloseTo(0.1, 5);
  });

  it("returns 0.5 (neutral) for a value exactly at the center", () => {
    expect(matchDirection(0, "positive", "bipolar")).toBeCloseTo(0.5, 5);
    expect(matchDirection(0.5, "positive", "unit")).toBeCloseTo(0.5, 5);
  });
});

describe("matchCategorical", () => {
  it("returns 1 for an exact match and 0 otherwise (no partial credit)", () => {
    expect(matchCategorical("major", "major")).toBe(1);
    expect(matchCategorical("major", "minor")).toBe(0);
  });
});

describe("matchKeywordMatch", () => {
  it("matches case-insensitively when the keyword is a substring of a detected part name", () => {
    expect(matchKeywordMatch("piano, alto sax, drums", "saxophone")).toBe(0); // "saxophone" not contained in "alto sax" either way
    expect(matchKeywordMatch("piano, alto sax, drums", "sax")).toBe(1);
    expect(matchKeywordMatch("Piano, Violin I, Violin II", "violin")).toBe(1);
  });

  it("matches the other direction too (a short detected part name is a substring of a longer keyword)", () => {
    // "cello".includes("cello section") is false -- only the reverse containment check catches this.
    expect(matchKeywordMatch("cello", "cello section")).toBe(1);
  });

  it("returns 0 for no match", () => {
    expect(matchKeywordMatch("piano, drums, bass", "trumpet")).toBe(0);
  });

  it("returns 0 for an empty keyword or value", () => {
    expect(matchKeywordMatch("piano, drums", "")).toBe(0);
    expect(matchKeywordMatch("", "piano")).toBe(0);
  });
});

describe("computeMatch", () => {
  it("returns 0 when there's no sample at all", () => {
    const expectation: FeatureExpectation = { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 1 };
    expect(computeMatch(expectation, undefined)).toBe(0);
  });

  it("dispatches 'range' kind to matchRange", () => {
    const expectation: FeatureExpectation = { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 1 };
    const sample: FeatureSample = { feature: "tempoBpm", value: 140, q: 0.9, evidence: "140 BPM" };
    expect(computeMatch(expectation, sample)).toBe(1);
  });

  it("dispatches 'direction' kind to matchDirection, looking up the feature's valueType from the registry", () => {
    const expectation: FeatureExpectation = { feature: "arousal", kind: "direction", direction: "positive", weight: 1 };
    const sample: FeatureSample = { feature: "arousal", value: 0.8, q: 0.7, evidence: "high arousal" };
    expect(computeMatch(expectation, sample)).toBeCloseTo(0.9, 5);
  });

  it("dispatches 'categorical' kind to matchCategorical", () => {
    const expectation: FeatureExpectation = { feature: "modality", kind: "categorical", targetCategory: "major", weight: 1 };
    const sampleMatch: FeatureSample = { feature: "modality", value: "major", q: 0.8, evidence: "C major, r=0.8" };
    const sampleMismatch: FeatureSample = { feature: "modality", value: "minor", q: 0.8, evidence: "A minor, r=0.8" };
    expect(computeMatch(expectation, sampleMatch)).toBe(1);
    expect(computeMatch(expectation, sampleMismatch)).toBe(0);
  });

  it("dispatches 'keywordMatch' kind to matchKeywordMatch", () => {
    const expectation: FeatureExpectation = { feature: "instrumentPresence", kind: "keywordMatch", targetKeyword: "sax", weight: 1 };
    const sample: FeatureSample = { feature: "instrumentPresence", value: "piano, alto sax, drums", q: 1, evidence: "parts: piano, alto sax, drums" };
    expect(computeMatch(expectation, sample)).toBe(1);
  });

  it("defensively returns 0 when the sample's value shape doesn't fit the expectation's kind", () => {
    const rangeExpectation: FeatureExpectation = { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 1 };
    const stringSample: FeatureSample = { feature: "tempoBpm", value: "fast", q: 0.9, evidence: "n/a" };
    expect(computeMatch(rangeExpectation, stringSample)).toBe(0);

    const categoricalExpectation: FeatureExpectation = { feature: "modality", kind: "categorical", targetCategory: "major", weight: 1 };
    const numberSample: FeatureSample = { feature: "modality", value: 1, q: 0.9, evidence: "n/a" };
    expect(computeMatch(categoricalExpectation, numberSample)).toBe(0);
  });

  it("returns 0 when the expectation is missing the field its kind requires", () => {
    const expectation: FeatureExpectation = { feature: "tempoBpm", kind: "range", weight: 1 }; // no targetRange
    const sample: FeatureSample = { feature: "tempoBpm", value: 140, q: 0.9, evidence: "140 BPM" };
    expect(computeMatch(expectation, sample)).toBe(0);
  });
});
