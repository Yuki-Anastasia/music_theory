import { describe, it, expect } from "vitest";
import { estimateValence, estimateArousal, describeMoodQuadrant } from "./emotionEstimate";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { DynamicsSummary } from "./dynamicsAnalysis";
import type { HarmonicTensionEstimate, SelfSimilarityEstimate } from "./aestheticMetrics";

function keyPoint(time: number, mode: "major" | "minor"): KeyTimelinePoint {
  return { time, key: { tonic: 0, mode, correlation: 0.9, confidence: "high" } };
}

const neutralTension: HarmonicTensionEstimate = { averageVoiceLeadingDistance: 3, maxVoiceLeadingDistance: 3 };
const highTension: HarmonicTensionEstimate = { averageVoiceLeadingDistance: 8, maxVoiceLeadingDistance: 12 };
const lowTension: HarmonicTensionEstimate = { averageVoiceLeadingDistance: 0, maxVoiceLeadingDistance: 0 };
const predictable: SelfSimilarityEstimate = { bestLagNotes: 4, correlation: 0.9 };
const unpredictable: SelfSimilarityEstimate = { bestLagNotes: 4, correlation: 0 };

describe("estimateValence", () => {
  it("is positive for an all-major, consonant song", () => {
    const keyTimeline = [keyPoint(0, "major"), keyPoint(4, "major")];
    expect(estimateValence(keyTimeline, 0.25, neutralTension)).toBeGreaterThan(0);
  });

  it("is negative for an all-minor, dissonant song", () => {
    const keyTimeline = [keyPoint(0, "minor"), keyPoint(4, "minor")];
    expect(estimateValence(keyTimeline, 0.05, neutralTension)).toBeLessThan(0);
  });

  it("returns 0 for an empty key timeline", () => {
    expect(estimateValence([], 0.2, neutralTension)).toBe(0);
  });

  it("lowers valence as harmonic tension rises, holding mode/consonance fixed", () => {
    const keyTimeline = [keyPoint(0, "major"), keyPoint(4, "major")];
    const relaxed = estimateValence(keyTimeline, 0.2, lowTension);
    const tense = estimateValence(keyTimeline, 0.2, highTension);
    expect(tense).toBeLessThan(relaxed);
  });
});

describe("estimateArousal", () => {
  const loudDynamics: DynamicsSummary = { averageLoudness: 0.9, dynamicRange: 0.2, trend: "stable" };
  const quietDynamics: DynamicsSummary = { averageLoudness: 0.1, dynamicRange: 0.2, trend: "stable" };

  it("is high for fast, loud, rhythmically busy, tense, unpredictable music", () => {
    expect(estimateArousal(160, loudDynamics, 3, highTension, unpredictable)).toBeGreaterThan(0.5);
  });

  it("is low for slow, quiet, rhythmically simple, relaxed, predictable music", () => {
    expect(estimateArousal(50, quietDynamics, 0, lowTension, predictable)).toBeLessThan(-0.5);
  });

  it("raises arousal as harmonic tension rises, holding other inputs fixed", () => {
    const calm = estimateArousal(90, quietDynamics, 1.5, lowTension, predictable);
    const tense = estimateArousal(90, quietDynamics, 1.5, highTension, predictable);
    expect(tense).toBeGreaterThan(calm);
  });

  it("raises arousal as melodic predictability falls, holding other inputs fixed", () => {
    const calm = estimateArousal(90, quietDynamics, 1.5, neutralTension, predictable);
    const surprising = estimateArousal(90, quietDynamics, 1.5, neutralTension, unpredictable);
    expect(surprising).toBeGreaterThan(calm);
  });
});

describe("describeMoodQuadrant", () => {
  it("maps all four quadrants", () => {
    expect(describeMoodQuadrant(0.5, 0.5)).toContain("高揚");
    expect(describeMoodQuadrant(-0.5, 0.5)).toContain("緊張");
    expect(describeMoodQuadrant(-0.5, -0.5)).toContain("悲しみ");
    expect(describeMoodQuadrant(0.5, -0.5)).toContain("穏やか");
  });
});
