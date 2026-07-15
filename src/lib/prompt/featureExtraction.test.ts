import { describe, it, expect } from "vitest";
import { buildFeatureSamples, explainUnavailableFeature, type PromptAlignmentInput } from "./featureExtraction";
import { FEATURE_NAMES } from "./ontology";

function baseInput(overrides: Partial<PromptAlignmentInput> = {}): PromptAlignmentInput {
  return {
    tempo: null,
    rhythmEntropy: null,
    dynamics: null,
    valence: null,
    arousal: null,
    aestheticMetrics: null,
    scaleFit: null,
    songForm: null,
    climax: null,
    arcSectionCount: 0,
    meter: null,
    instrumentBuildUp: null,
    partLabels: [],
    tonnetzTrajectory: [],
    histogram: new Array(12).fill(0),
    maxTime: 0,
    noteCount: 0,
    ...overrides,
  };
}

describe("buildFeatureSamples", () => {
  it("returns an empty map when every input is null/empty", () => {
    expect(buildFeatureSamples(baseInput())).toEqual({});
  });

  it("gives notated tempo full confidence (q=1) and estimated tempo the raw autocorrelation as q", () => {
    const notated = buildFeatureSamples(baseInput({ tempo: { bpm: 120, confidence: "high", source: "notated" } }));
    expect(notated.tempoBpm?.value).toBe(120);
    expect(notated.tempoBpm?.q).toBe(1);

    const estimated = buildFeatureSamples(
      baseInput({ tempo: { bpm: 128, confidence: "high", source: "estimated", rawCorrelation: 0.73 } })
    );
    expect(estimated.tempoBpm?.value).toBe(128);
    expect(estimated.tempoBpm?.q).toBeCloseTo(0.73, 5);
  });

  it("sources modality's confidence from the key-profile correlation, not a fallback", () => {
    // A clean C major triad histogram should correlate strongly with the major profile.
    const histogram = new Array(12).fill(0);
    histogram[0] = 3; // C
    histogram[4] = 2; // E
    histogram[7] = 2; // G
    const result = buildFeatureSamples(baseInput({ histogram, noteCount: 7 }));
    expect(result.modality?.value).toBe("major");
    expect(result.modality?.q).toBeGreaterThan(0.5);
  });

  it("sources scaleCharacter's confidence from ScaleFitEstimate.coverage", () => {
    const result = buildFeatureSamples(
      baseInput({ scaleFit: { root: 0, scaleName: "major", pitchClasses: [0, 2, 4, 5, 7, 9, 11], coverage: 0.97, confidence: "high" } })
    );
    expect(result.scaleCharacter?.value).toBe("major");
    expect(result.scaleCharacter?.q).toBe(0.97);
  });

  it("derives a stable moodQuadrant key from valence/arousal signs", () => {
    expect(buildFeatureSamples(baseInput({ valence: 0.5, arousal: 0.5, noteCount: 50 })).moodQuadrant?.value).toBe("excited");
    expect(buildFeatureSamples(baseInput({ valence: -0.5, arousal: 0.5, noteCount: 50 })).moodQuadrant?.value).toBe("tense");
    expect(buildFeatureSamples(baseInput({ valence: -0.5, arousal: -0.5, noteCount: 50 })).moodQuadrant?.value).toBe("sad");
    expect(buildFeatureSamples(baseInput({ valence: 0.5, arousal: -0.5, noteCount: 50 })).moodQuadrant?.value).toBe("calm");
  });

  it("omits syncopation and instrumentTextureBuildUp entirely for audio-transcribed input (meter/instrumentBuildUp null)", () => {
    const result = buildFeatureSamples(
      baseInput({
        tempo: { bpm: 120, confidence: "high", source: "estimated", rawCorrelation: 0.8 },
        noteCount: 100,
      })
    );
    expect(result.syncopation).toBeUndefined();
    expect(result.instrumentTextureBuildUp).toBeUndefined();
  });

  it("includes syncopation (with a pairCount-scaled q) when score-derived meter analysis is present", () => {
    const result = buildFeatureSamples(
      baseInput({
        meter: {
          meterSummary: [],
          syncopation: { rawScore: 10, maxPossibleScore: 20, normalizedScore: 0.5, averageContributionPerPair: 0.5, pairCount: 20 },
          harmonicRhythmAlignment: null,
        },
      })
    );
    expect(result.syncopation?.value).toBe(0.5);
    expect(result.syncopation?.q).toBe(1); // pairCount(20) meets MIN_SYNCOPATION_PAIRS_FOR_FULL_CONFIDENCE(20)
  });

  it("includes instrumentTextureBuildUp as ground truth (q=1) and correctly classifies layered vs. constant", () => {
    const layered = buildFeatureSamples(
      baseInput({
        instrumentBuildUp: {
          segmentDurationSec: 1,
          parts: [
            { partLabel: "guitar", countsBySegment: [1, 1, 1], firstActiveSegment: 0 },
            { partLabel: "drums", countsBySegment: [0, 1, 1], firstActiveSegment: 1 },
          ],
        },
      })
    );
    expect(layered.instrumentTextureBuildUp?.value).toBe("layered");
    expect(layered.instrumentTextureBuildUp?.q).toBe(1);

    const constant = buildFeatureSamples(
      baseInput({
        instrumentBuildUp: {
          segmentDurationSec: 1,
          parts: [{ partLabel: "guitar", countsBySegment: [1, 1, 1], firstActiveSegment: 0 }],
        },
      })
    );
    expect(constant.instrumentTextureBuildUp?.value).toBe("constant");
  });

  it("omits instrumentPresence entirely for audio-transcribed input (no part labels)", () => {
    const result = buildFeatureSamples(baseInput({ noteCount: 100 }));
    expect(result.instrumentPresence).toBeUndefined();
  });

  it("includes instrumentPresence as ground truth (q=1) with a lowercased, joined part-name value for score input", () => {
    const result = buildFeatureSamples(baseInput({ partLabels: ["Piano", "Alto Sax", "Drums"] }));
    expect(result.instrumentPresence?.value).toBe("piano, alto sax, drums");
    expect(result.instrumentPresence?.q).toBe(1);
  });

  it("omits climax fields when no climax was detected", () => {
    expect(buildFeatureSamples(baseInput()).climaxPresence).toBeUndefined();
    expect(buildFeatureSamples(baseInput()).climaxTiming).toBeUndefined();
  });

  it("computes climaxTiming as a 0-1 position through the song, scaled by arc section count", () => {
    const result = buildFeatureSamples(
      baseInput({
        climax: { sectionIndex: 2, startSec: 70, endSec: 90, score: 2.5 },
        arcSectionCount: 4,
        maxTime: 100,
      })
    );
    expect(result.climaxPresence?.value).toBe("present");
    expect(result.climaxTiming?.value).toBeCloseTo(0.8, 5); // midpoint 80/100
    expect(result.climaxTiming?.q).toBe(1); // arcSectionCount(4) meets MIN_ARC_SECTIONS_FOR_FULL_CONFIDENCE(4)
  });

  it("uses the average chord-detection coverage across the Tonnetz trajectory as harmonicTension's q, when available", () => {
    const aestheticMetrics = {
      consonance: { averageGradus: 5, consonanceScore: 0.2 },
      harmonicTension: { averageVoiceLeadingDistance: 4, maxVoiceLeadingDistance: 6 },
      predictability: { conditionalEntropyBits: 1, maxEntropyBits: 2 },
      selfSimilarity: { bestLagNotes: 4, correlation: 0.6 },
    };
    const result = buildFeatureSamples(
      baseInput({
        aestheticMetrics,
        noteCount: 5, // deliberately low, so the fallback would give a low q if it were used instead
        tonnetzTrajectory: [
          { time: 0, chord: { root: 0, mode: "major", coverage: 0.9, confidence: "high" } },
          { time: 1, chord: { root: 5, mode: "major", coverage: 0.7, confidence: "high" } },
        ],
      })
    );
    expect(result.harmonicTension?.q).toBeCloseTo(0.8, 5); // average of 0.9 and 0.7, not dataSufficiency(5)
  });
});

describe("explainUnavailableFeature", () => {
  it("gives a specific, source-aware reason for score-only features", () => {
    expect(explainUnavailableFeature("syncopation")).toMatch(/score\/tab/i);
    expect(explainUnavailableFeature("instrumentTextureBuildUp")).toMatch(/score\/tab/i);
    expect(explainUnavailableFeature("instrumentPresence")).toMatch(/score\/tab/i);
  });

  it("returns a non-empty string for every known feature (no unhandled case falls through to undefined)", () => {
    for (const feature of FEATURE_NAMES) {
      expect(explainUnavailableFeature(feature).length).toBeGreaterThan(0);
    }
  });
});
