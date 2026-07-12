import { describe, it, expect } from "vitest";
import { buildAnalysisFacts } from "./summaryPrompt";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { MoodFacts } from "./summaryPrompt";
import type { ArcSection } from "./songArc";

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
});
