import { describe, it, expect } from "vitest";
import { describeMismatch } from "./suggestions";
import type { FeatureExpectation } from "./conceptTypes";
import type { FeatureSample } from "./featureSample";

describe("describeMismatch", () => {
  it("describes a range mismatch below the target, with direction", () => {
    const expectation: FeatureExpectation = { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 1 };
    const sample: FeatureSample = { feature: "tempoBpm", value: 90, q: 1, evidence: "90 BPM (notated)" };
    const text = describeMismatch(expectation, sample);
    expect(text).toContain("Tempo (BPM)");
    expect(text).toContain("120–160");
    expect(text).toContain("90 BPM (notated)");
    expect(text).toContain("below the expected range");
  });

  it("describes a range mismatch above the target, with direction", () => {
    const expectation: FeatureExpectation = { feature: "tempoBpm", kind: "range", targetRange: [60, 90], weight: 1 };
    const sample: FeatureSample = { feature: "tempoBpm", value: 150, q: 1, evidence: "150 BPM (notated)" };
    const text = describeMismatch(expectation, sample);
    expect(text).toContain("above the expected range");
  });

  it("describes a direction mismatch for a bipolar feature", () => {
    const expectation: FeatureExpectation = { feature: "valence", kind: "direction", direction: "positive", weight: 1 };
    const sample: FeatureSample = { feature: "valence", value: -0.6, q: 0.9, evidence: "-0.60" };
    const text = describeMismatch(expectation, sample);
    expect(text).toContain("Valence");
    expect(text).toContain("expected to lean positive/higher");
    expect(text).toContain("leans negative/lower");
  });

  it("rescales a unit-type feature's value to bipolar before judging its leaning", () => {
    // rhythmicComplexity is "unit" (0-1); 0.2 rescales to -0.6 (negative), which
    // should read as "leans negative/lower" even though the raw value is positive.
    const expectation: FeatureExpectation = { feature: "rhythmicComplexity", kind: "direction", direction: "positive", weight: 1 };
    const sample: FeatureSample = { feature: "rhythmicComplexity", value: 0.2, q: 0.9, evidence: "rhythmic entropy 0.2" };
    const text = describeMismatch(expectation, sample);
    expect(text).toContain("leans negative/lower");
  });

  it("describes a categorical mismatch with both the expected and detected values", () => {
    const expectation: FeatureExpectation = { feature: "dynamicsTrend", kind: "categorical", targetCategory: "crescendo", weight: 1 };
    const sample: FeatureSample = { feature: "dynamicsTrend", value: "stable", q: 1, evidence: "stable" };
    const text = describeMismatch(expectation, sample);
    expect(text).toContain('expected "crescendo"');
    expect(text).toContain('detected "stable"');
  });

  it("describes a keywordMatch mismatch citing the actual detected parts", () => {
    const expectation: FeatureExpectation = { feature: "instrumentPresence", kind: "keywordMatch", targetKeyword: "orchestra", weight: 1 };
    const sample: FeatureSample = { feature: "instrumentPresence", value: "piano", q: 1, evidence: "parts: Piano" };
    const text = describeMismatch(expectation, sample);
    expect(text).toContain('looking for "orchestra"');
    expect(text).toContain("parts: Piano");
  });
});
