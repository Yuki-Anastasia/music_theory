import { describe, it, expect } from "vitest";
import { buildAnalysisFacts } from "./summaryPrompt";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { FourierTimelinePoint } from "./fourierTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { InstrumentTagWindow } from "../audio/instrumentTagger";

const EMPTY_METRICS: AestheticMetrics = {
  consonance: { averageGradus: 0, consonanceScore: 0 },
  harmonicTension: { averageVoiceLeadingDistance: 0, maxVoiceLeadingDistance: 0 },
  predictability: { conditionalEntropyBits: 0, maxEntropyBits: Math.log2(12) },
  selfSimilarity: { bestLagNotes: 0, correlation: 0 },
};
const EMPTY_TAGS: InstrumentTagWindow[] = [];

function keyPoint(time: number, tonic: number, mode: "major" | "minor", confidence: "high" | "low" = "high"): KeyTimelinePoint {
  return { time, key: { tonic, mode, correlation: 0.9, confidence } };
}

function fourierPoint(time: number, x5: number): FourierTimelinePoint {
  return {
    time,
    coefficients: [0, 1, 2, 3, 4, 5, 6].map((k) => ({
      k,
      magnitude: k === 5 ? x5 : 0,
      normalizedMagnitude: k === 5 ? x5 : 0,
      phase: 0,
    })),
  };
}

function chordPoint(time: number, root: number, mode: "major" | "minor"): TonnetzTimelinePoint {
  return { time, chord: { root, mode, coverage: 1, confidence: "high" } };
}

describe("buildAnalysisFacts", () => {
  it("includes the song label and duration", () => {
    const facts = buildAnalysisFacts("test.mp3", 90, [], [], [], EMPTY_METRICS, EMPTY_TAGS);
    expect(facts).toContain("test.mp3");
    expect(facts).toContain("1:30");
  });

  it("collapses consecutive identical keys into one segment with a time range", () => {
    const keyTimeline = [keyPoint(0, 0, "major"), keyPoint(4, 0, "major"), keyPoint(8, 7, "major")];
    const facts = buildAnalysisFacts("song", 12, keyTimeline, [], [], EMPTY_METRICS, EMPTY_TAGS);
    expect(facts).toContain("0:00-0:08 C");
    expect(facts).toContain("0:08-0:12 G");
  });

  it("flags low-confidence key segments", () => {
    const keyTimeline = [keyPoint(0, 2, "minor", "low")];
    const facts = buildAnalysisFacts("song", 4, keyTimeline, [], [], EMPTY_METRICS, EMPTY_TAGS);
    expect(facts).toContain("Dm(確信度低)");
  });

  it("summarizes Fourier |X5| as avg/min/max", () => {
    const fourierTimeline = [fourierPoint(0, 0.4), fourierPoint(4, 0.6), fourierPoint(8, 0.8)];
    const facts = buildAnalysisFacts("song", 12, [], fourierTimeline, [], EMPTY_METRICS, EMPTY_TAGS);
    expect(facts).toContain("平均0.60");
    expect(facts).toContain("最小0.40");
    expect(facts).toContain("最大0.80");
  });

  it("joins the chord trajectory with arrows", () => {
    const trajectory = [chordPoint(0, 0, "major"), chordPoint(2, 5, "major"), chordPoint(4, 7, "major")];
    const facts = buildAnalysisFacts("song", 6, [], [], trajectory, EMPTY_METRICS, EMPTY_TAGS);
    expect(facts).toContain("C → F → G");
  });

  it("reports 'no data' for empty timelines rather than crashing", () => {
    const facts = buildAnalysisFacts("song", 0, [], [], [], EMPTY_METRICS, EMPTY_TAGS);
    expect(facts).toContain("データなし");
  });

  it("includes named formulas/theories and values for each aesthetic metric", () => {
    const metrics: AestheticMetrics = {
      consonance: { averageGradus: 4.2, consonanceScore: 0.24 },
      harmonicTension: { averageVoiceLeadingDistance: 2.5, maxVoiceLeadingDistance: 5 },
      predictability: { conditionalEntropyBits: 1.8, maxEntropyBits: Math.log2(12) },
      selfSimilarity: { bestLagNotes: 4, correlation: 0.62 },
    };
    const facts = buildAnalysisFacts("song", 10, [], [], [], metrics, EMPTY_TAGS);
    expect(facts).toContain("Gradus Suavitatis");
    expect(facts).toContain("平均Γ=4.20");
    expect(facts).toContain("平均2.50、最大5.00");
    expect(facts).toContain("シャノンの条件付きエントロピー");
    expect(facts).toContain("1.80");
    expect(facts).toContain("ラグ4音で相関0.62");
  });

  it("summarizes the highest-confidence instrument/vocal tags across all windows", () => {
    const instrumentTags: InstrumentTagWindow[] = [
      { time: 0, tags: [{ label: "Guitar", score: 0.6 }, { label: "Singing", score: 0.3 }] },
      { time: 2, tags: [{ label: "Singing", score: 0.8 }, { label: "Piano", score: 0.1 }] },
    ];
    const facts = buildAnalysisFacts("song", 4, [], [], [], EMPTY_METRICS, instrumentTags);
    expect(facts).toContain("YAMNet");
    expect(facts).toContain("Singing(80%)");
    expect(facts).toContain("Guitar(60%)");
  });
});
