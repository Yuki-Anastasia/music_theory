import { describe, it, expect } from "vitest";
import { buildAnalysisFacts } from "./summaryPrompt";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { MoodFacts } from "./summaryPrompt";
import type { ArcSection } from "./songArc";
import type { MeterAnalysisResult } from "./meterAnalysis";
import type { CounterpointAnalysis } from "./counterpoint";

const EMPTY_METRICS: AestheticMetrics = {
  consonance: { averageGradus: 0, consonanceScore: 0 },
  harmonicTension: { averageVoiceLeadingDistance: 0, maxVoiceLeadingDistance: 0 },
  predictability: { conditionalEntropyBits: 0, maxEntropyBits: Math.log2(12) },
  selfSimilarity: { bestLagNotes: 0, correlation: 0 },
};
const EMPTY_MOOD: MoodFacts = {
  tempo: { bpm: 0, confidence: "low" },
  rhythmEntropy: { entropyBits: 0, maxEntropyBits: 0 },
  dynamics: { averageLoudness: 0, dynamicRange: 0, trend: "stable" },
  valence: 0,
  arousal: 0,
};
const EMPTY_ARC: ArcSection[] = [];

function keyPoint(time: number, tonic: number, mode: "major" | "minor", confidence: "high" | "low" = "high"): KeyTimelinePoint {
  return { time, key: { tonic, mode, correlation: 0.9, confidence } };
}

function chordPoint(time: number, root: number, mode: "major" | "minor"): TonnetzTimelinePoint {
  return { time, chord: { root, mode, coverage: 1, confidence: "high" } };
}

describe("buildAnalysisFacts", () => {
  it("includes the song label and duration", () => {
    const facts = buildAnalysisFacts("test.mp3", 90, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).toContain("test.mp3");
    expect(facts).toContain("1:30");
  });

  it("collapses consecutive identical keys into one segment with a time range", () => {
    const keyTimeline = [keyPoint(0, 0, "major"), keyPoint(4, 0, "major"), keyPoint(8, 7, "major")];
    const facts = buildAnalysisFacts("song", 12, keyTimeline, [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).toContain("0:00-0:08 C");
    expect(facts).toContain("0:08-0:12 G");
  });

  it("flags low-confidence key segments", () => {
    const keyTimeline = [keyPoint(0, 2, "minor", "low")];
    const facts = buildAnalysisFacts("song", 4, keyTimeline, [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).toContain("Dm(確信度低)");
  });

  it("joins the chord trajectory with arrows", () => {
    const trajectory = [chordPoint(0, 0, "major"), chordPoint(2, 5, "major"), chordPoint(4, 7, "major")];
    const facts = buildAnalysisFacts("song", 6, [], trajectory, EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).toContain("C → F → G");
  });

  it("reports 'no data' for empty timelines rather than crashing", () => {
    const facts = buildAnalysisFacts("song", 0, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).toContain("データなし");
  });

  it("includes predictability and self-similarity, but not the whole-song consonance/tension duplicated by the arc", () => {
    const metrics: AestheticMetrics = {
      consonance: { averageGradus: 4.2, consonanceScore: 0.24 },
      harmonicTension: { averageVoiceLeadingDistance: 2.5, maxVoiceLeadingDistance: 5 },
      predictability: { conditionalEntropyBits: 1.8, maxEntropyBits: Math.log2(12) },
      selfSimilarity: { bestLagNotes: 4, correlation: 0.62 },
    };
    const facts = buildAnalysisFacts("song", 10, [], [], metrics, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).toContain("シャノンの条件付きエントロピー");
    expect(facts).toContain("1.80");
    expect(facts).toContain("ラグ4音で相関0.62");
    expect(facts).not.toContain("Gradus Suavitatis");
    expect(facts).not.toContain("平均Γ=4.20");
  });

  it("summarizes tempo and rhythmic complexity, but not the whole-song dynamics/mood duplicated by the arc", () => {
    const mood: MoodFacts = {
      tempo: { bpm: 128, confidence: "high" },
      rhythmEntropy: { entropyBits: 1.5, maxEntropyBits: 2 },
      dynamics: { averageLoudness: 0.7, dynamicRange: 0.3, trend: "crescendo" },
      valence: 0.5,
      arousal: 0.6,
    };
    const facts = buildAnalysisFacts("song", 4, [], [], EMPTY_METRICS, mood, EMPTY_ARC);
    expect(facts).toContain("約128BPM");
    expect(facts).not.toContain("クレッシェンド");
    expect(facts).not.toContain("Russell");
    expect(facts).not.toContain("高揚・喜び");
  });

  it("labels a notated tempo as such, distinct from an autocorrelation estimate", () => {
    const mood: MoodFacts = {
      ...EMPTY_MOOD,
      tempo: { bpm: 120, confidence: "high", source: "notated" },
    };
    const facts = buildAnalysisFacts("song", 4, [], [], EMPTY_METRICS, mood, EMPTY_ARC);
    expect(facts).toContain("約120BPM(楽譜に記譜された値)");
  });

  it("narrates the song as a section-by-section arc rather than a single aggregate", () => {
    const arc: ArcSection[] = [
      {
        startSec: 0,
        endSec: 4,
        consonance: { averageGradus: 4, consonanceScore: 0.25 },
        dynamics: { averageLoudness: 0.2, dynamicRange: 0.1, trend: "stable" },
        valence: 0.5,
        arousal: -0.5,
      },
      {
        startSec: 4,
        endSec: 8,
        consonance: { averageGradus: 11, consonanceScore: 0.09 },
        dynamics: { averageLoudness: 0.9, dynamicRange: 0.3, trend: "crescendo" },
        valence: -0.5,
        arousal: 0.6,
      },
    ];
    const facts = buildAnalysisFacts("song", 8, [], [], EMPTY_METRICS, EMPTY_MOOD, arc);
    expect(facts).toContain("曲の推移");
    expect(facts).toContain("0:00-0:04");
    expect(facts).toContain("0:04-0:08");
    expect(facts).toContain("協和度平均Γ=4.00");
    expect(facts).toContain("協和度平均Γ=11.00");
    expect(facts).toContain("穏やか・安らぎ");
    expect(facts).toContain("緊張・不安");
  });

  it("still works with the pre-existing 7-arg call (meter/counterpoint omitted)", () => {
    const facts = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).not.toContain("シンコペーション");
    expect(facts).not.toContain("対位法");
  });

  it("includes the meter/syncopation section when meter is present", () => {
    const meter: MeterAnalysisResult = {
      meterSummary: [{ time: 0, numerator: 4, denominator: 4, beatWeights: [] }],
      syncopation: { rawScore: 3, maxPossibleScore: 5, normalizedScore: 0.6, averageContributionPerPair: 3, pairCount: 1 },
      harmonicRhythmAlignment: null,
    };
    const facts = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC, meter);
    expect(facts).toContain("シンコペーション指数: 0.60");
    expect(facts).toContain("4/4拍子");
  });

  it("omits the meter section entirely when meter is null (audio-transcribed input)", () => {
    const facts = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC, null);
    expect(facts).not.toContain("シンコペーション");
  });

  it("includes the counterpoint section, listing per-pair motion percentages and parallel counts", () => {
    const counterpoint: CounterpointAnalysis = {
      pairs: [
        {
          partA: "Soprano",
          partB: "Alto",
          verticalityCount: 3,
          motionCounts: { contrary: 1, oblique: 0, similar: 0, parallel: 1 },
          motionPercentages: { contrary: 50, oblique: 0, similar: 0, parallel: 50 },
          parallelFifthsCount: 2,
          parallelOctavesCount: 0,
          parallelMotionEvents: [],
        },
      ],
      partsAnalyzed: ["Soprano", "Alto"],
      totalPartsFound: 2,
    };
    const facts = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC, null, counterpoint);
    expect(facts).toContain("Soprano - Alto");
    expect(facts).toContain("反行50%");
    expect(facts).toContain("平行5度2回");
  });

  it("omits the counterpoint section when counterpoint is omitted", () => {
    const facts = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(facts).not.toContain("対位法");
  });

  it("states which parts the analysis covers when includedParts is given", () => {
    const facts = buildAnalysisFacts(
      "song",
      10,
      [],
      [],
      EMPTY_METRICS,
      EMPTY_MOOD,
      EMPTY_ARC,
      null,
      null,
      ["Guitar", "Bass"]
    );
    expect(facts).toContain("解析対象パート: Guitar、Bass");
  });

  it("omits the included-parts line when includedParts is empty or omitted", () => {
    const withEmpty = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC, null, null, []);
    const withOmitted = buildAnalysisFacts("song", 10, [], [], EMPTY_METRICS, EMPTY_MOOD, EMPTY_ARC);
    expect(withEmpty).not.toContain("解析対象パート");
    expect(withOmitted).not.toContain("解析対象パート");
  });
});
