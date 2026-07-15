import { describe, it, expect } from "vitest";
import { scorePrompt, detectContradictions, MIN_CONCEPT_CONFIDENCE_FOR_OVERALL } from "./scoring";
import type { ParsedPrompt, PromptConcept } from "./conceptTypes";
import type { FeatureSampleMap } from "./featureSample";

describe("scorePrompt", () => {
  it("matches the plan's hand-computed fixture for a fully-covered concept", () => {
    // Concept: "energetic and driving" (priority 1.0), arousal(direction=positive, weight=0.6) + tempoBpm(range=[120,160], weight=0.4).
    // Samples: arousal={value:0.8, q:0.7}, tempoBpm={value:140, q:0.9}.
    // m(arousal) = clamp01(0.5 + 0.8*0.5) = 0.9; m(tempo) = 1 (in range).
    // Σ[a·q·m] = 0.6*0.7*0.9 + 0.4*0.9*1 = 0.738; Σ[a·q] = 0.6*0.7 + 0.4*0.9 = 0.78.
    // ConceptScore = 0.738/0.78 = 0.9461538...; coverage = 2/2 = 1; ConceptConfidence = 1*(0.78/1.0) = 0.78.
    const parsed: ParsedPrompt = {
      rawPrompt: "energetic and driving",
      concepts: [
        {
          concept: "energetic and driving",
          category: "energy",
          priority: 1.0,
          timeScope: "global",
          expected: [
            { feature: "arousal", kind: "direction", direction: "positive", weight: 0.6 },
            { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 0.4 },
          ],
        },
      ],
    };
    const samples: FeatureSampleMap = {
      arousal: { feature: "arousal", value: 0.8, q: 0.7, evidence: "arousal 0.8" },
      tempoBpm: { feature: "tempoBpm", value: 140, q: 0.9, evidence: "140 BPM" },
    };

    const report = scorePrompt(parsed, samples);
    expect(report.concepts).toHaveLength(1);
    const result = report.concepts[0];
    expect(result.score).toBeCloseTo(0.9461538, 5);
    expect(result.coverage).toBe(1);
    expect(result.confidence).toBeCloseTo(0.78, 5);
    expect(result.status).toBe("scored");

    // A single fully-scored concept's OverallAlignment should reproduce its own score exactly.
    expect(report.overallAlignment).toBeCloseTo(0.9461538, 5);
  });

  it("excludes a zero-sample concept as insufficient evidence, and from OverallAlignment's denominator", () => {
    const parsed: ParsedPrompt = {
      rawPrompt: "lush orchestral instrumentation",
      concepts: [
        {
          concept: "lush orchestral instrumentation",
          category: "instrumentation",
          priority: 0.8,
          timeScope: "global",
          expected: [{ feature: "instrumentTextureBuildUp", kind: "categorical", targetCategory: "layered", weight: 1.0 }],
        },
      ],
    };
    const report = scorePrompt(parsed, {}); // no samples at all -- audio-only input

    const result = report.concepts[0];
    expect(result.coverage).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.status).toBe("insufficientEvidence");
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toMatch(/score\/tab/i);
    expect(report.overallAlignment).toBeNull();
  });

  it("combines a scored and an excluded concept: OverallAlignment reflects only the scored one", () => {
    const parsed: ParsedPrompt = {
      rawPrompt: "energetic and driving, with lush orchestral instrumentation",
      concepts: [
        {
          concept: "energetic and driving",
          category: "energy",
          priority: 1.0,
          timeScope: "global",
          expected: [
            { feature: "arousal", kind: "direction", direction: "positive", weight: 0.6 },
            { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 0.4 },
          ],
        },
        {
          concept: "lush orchestral instrumentation",
          category: "instrumentation",
          priority: 0.8,
          timeScope: "global",
          expected: [{ feature: "instrumentTextureBuildUp", kind: "categorical", targetCategory: "layered", weight: 1.0 }],
        },
      ],
    };
    const samples: FeatureSampleMap = {
      arousal: { feature: "arousal", value: 0.8, q: 0.7, evidence: "arousal 0.8" },
      tempoBpm: { feature: "tempoBpm", value: 140, q: 0.9, evidence: "140 BPM" },
    };

    const report = scorePrompt(parsed, samples);
    expect(report.concepts[0].status).toBe("scored");
    expect(report.concepts[1].status).toBe("insufficientEvidence");
    expect(report.overallAlignment).toBeCloseTo(0.9461538, 5);
  });

  it("buckets a concept's expected features into support / missing / mismatches, based on confidence and match strength", () => {
    const parsed: ParsedPrompt = {
      rawPrompt: "test concept",
      concepts: [
        {
          concept: "test concept",
          category: "harmony",
          priority: 1,
          timeScope: "global",
          expected: [
            { feature: "tempoBpm", kind: "range", targetRange: [120, 160], weight: 0.3 }, // confident + strong match -> support
            { feature: "consonance", kind: "range", targetRange: [10, 20], weight: 0.2 }, // confident but weak match -> neither
            { feature: "diatonicity", kind: "range", targetRange: [0, 1], weight: 0.2 }, // low confidence -> missing (confidence too low)
            { feature: "instrumentPresence", kind: "keywordMatch", targetKeyword: "sax", weight: 0.3 }, // no sample -> missing (source-aware reason)
          ],
        },
      ],
    };
    const samples: FeatureSampleMap = {
      tempoBpm: { feature: "tempoBpm", value: 140, q: 0.9, evidence: "140 BPM" },
      consonance: { feature: "consonance", value: 0.2, q: 0.9, evidence: "consonance 0.2" },
      diatonicity: { feature: "diatonicity", value: 0.5, q: 0.3, evidence: "diatonicity 0.5" },
    };

    const result = scorePrompt(parsed, samples).concepts[0];
    expect(result.coverage).toBe(0.5); // 2 of 4 features cleared the confidence threshold (tempoBpm, consonance)

    expect(result.support).toHaveLength(1);
    expect(result.support[0]).toContain("140 BPM");

    expect(result.missing).toHaveLength(2);
    expect(result.missing.some((m) => m.includes("diatonicity 0.5") && m.includes("confidence too low"))).toBe(true);
    expect(result.missing.some((m) => /score\/tab/i.test(m))).toBe(true);

    // consonance was confidently detected but didn't match -- shouldn't be cited as either support or missing...
    expect(result.support.some((s) => s.includes("consonance"))).toBe(false);
    expect(result.missing.some((m) => m.includes("consonance"))).toBe(false);
    // ...instead it's an actionable mismatch: what was expected vs. what was actually measured.
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toContain("Consonance");
    expect(result.mismatches[0]).toContain("10–20");
    expect(result.mismatches[0]).toContain("consonance 0.2");
  });

  it("computes ConceptConfidence's threshold boundary consistently with MIN_CONCEPT_CONFIDENCE_FOR_OVERALL", () => {
    expect(MIN_CONCEPT_CONFIDENCE_FOR_OVERALL).toBeGreaterThan(0);
    expect(MIN_CONCEPT_CONFIDENCE_FOR_OVERALL).toBeLessThan(1);
  });
});

describe("detectContradictions", () => {
  function directionConcept(concept: string, feature: PromptConcept["expected"][number]["feature"], direction: "positive" | "negative"): PromptConcept {
    return {
      concept,
      category: "dynamics",
      priority: 1,
      timeScope: "global",
      expected: [{ feature, kind: "direction", direction, weight: 1 }],
    };
  }

  it("flags exactly one contradiction between two concepts expecting opposite directions on the same feature", () => {
    const concepts = [
      directionConcept("minimal, sparse", "averageLoudness", "negative"),
      directionConcept("wall of sound", "averageLoudness", "positive"),
    ];
    const contradictions = detectContradictions(concepts);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].feature).toBe("averageLoudness");
    expect([contradictions[0].conceptA, contradictions[0].conceptB]).toEqual(
      expect.arrayContaining(["minimal, sparse", "wall of sound"])
    );
  });

  it("does not flag concepts expecting the same direction", () => {
    const concepts = [
      directionConcept("energetic", "arousal", "positive"),
      directionConcept("upbeat", "arousal", "positive"),
    ];
    expect(detectContradictions(concepts)).toHaveLength(0);
  });

  it("does not flag concepts on different features", () => {
    const concepts = [
      directionConcept("minimal, sparse", "averageLoudness", "negative"),
      directionConcept("melancholic", "valence", "negative"),
    ];
    expect(detectContradictions(concepts)).toHaveLength(0);
  });

  it("surfaces the contradiction in both concepts' report entries", () => {
    const parsed: ParsedPrompt = {
      rawPrompt: "minimal, sparse but also a wall of sound",
      concepts: [
        directionConcept("minimal, sparse", "averageLoudness", "negative"),
        directionConcept("wall of sound", "averageLoudness", "positive"),
      ],
    };
    const samples: FeatureSampleMap = {
      averageLoudness: { feature: "averageLoudness", value: 0.5, q: 0.9, evidence: "average loudness 0.5" },
    };
    const report = scorePrompt(parsed, samples);
    expect(report.contradictions).toHaveLength(1);
    expect(report.concepts[0].contradictions).toHaveLength(1);
    expect(report.concepts[0].contradictions[0]).toContain("wall of sound");
    expect(report.concepts[1].contradictions).toHaveLength(1);
    expect(report.concepts[1].contradictions[0]).toContain("minimal, sparse");
  });
});
