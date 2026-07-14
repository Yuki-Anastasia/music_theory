import { describe, it, expect } from "vitest";
import { buildAnalysisFacts, AnalysisFactsInput } from "./summaryPrompt";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { FourierTimelinePoint } from "./fourierTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";
import type { AestheticMetrics } from "./aestheticMetrics";
import type { MoodFacts } from "./summaryPrompt";
import type { ArcSection, ClimaxEstimate } from "./songArc";
import type { MeterAnalysisResult } from "./meterAnalysis";
import type { CounterpointAnalysis } from "./counterpoint";
import type { NotatedKeyPoint } from "../score/musicXml";
import type { ScoreConsistencyWarning } from "../score/scoreConsistency";
import type { MelodicRange } from "./melodicRange";
import type { ModulationEvent } from "./modulation";
import type { ChordFunctionPoint } from "./chordFunction";
import type { SongFormResult } from "./songForm";
import type { PitchClassShare, ScaleFitEstimate } from "./pitchClassProfile";
import type { NoteValueCount } from "./rhythmAnalysis";
import type { InstrumentBuildUp } from "./instrumentDensity";
import { PERCUSSION_PART_LABEL } from "./instrumentDensity";

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

/** Minimal base input for buildAnalysisFacts — individual tests spread overrides on top. */
function baseInput(overrides: Partial<AnalysisFactsInput> = {}): AnalysisFactsInput {
  return {
    label: "song",
    durationSec: 10,
    keyTimeline: [],
    fourierTimeline: [],
    tonnetzTrajectory: [],
    metrics: EMPTY_METRICS,
    mood: EMPTY_MOOD,
    arc: EMPTY_ARC,
    ...overrides,
  };
}

describe("buildAnalysisFacts", () => {
  it("includes the song label and duration", () => {
    const facts = buildAnalysisFacts(baseInput({ label: "test.mp3", durationSec: 90 }));
    expect(facts).toContain("test.mp3");
    expect(facts).toContain("1:30");
  });

  it("collapses consecutive identical keys into one segment with a time range", () => {
    const keyTimeline = [keyPoint(0, 0, "major"), keyPoint(4, 0, "major"), keyPoint(8, 7, "major")];
    const facts = buildAnalysisFacts(baseInput({ keyTimeline, durationSec: 12 }));
    expect(facts).toContain("0:00-0:08 C");
    expect(facts).toContain("0:08-0:12 G");
  });

  it("flags low-confidence key segments", () => {
    const keyTimeline = [keyPoint(0, 2, "minor", "low")];
    const facts = buildAnalysisFacts(baseInput({ keyTimeline, durationSec: 4 }));
    expect(facts).toContain("Dm(確信度低)");
  });

  it("joins the chord trajectory with arrows", () => {
    const trajectory = [chordPoint(0, 0, "major"), chordPoint(2, 5, "major"), chordPoint(4, 7, "major")];
    const facts = buildAnalysisFacts(baseInput({ tonnetzTrajectory: trajectory, durationSec: 6 }));
    expect(facts).toContain("C → F → G");
  });

  it("reports 'no data' for empty timelines rather than crashing", () => {
    const facts = buildAnalysisFacts(baseInput({ durationSec: 0 }));
    expect(facts).toContain("データなし");
  });

  it("includes predictability and self-similarity, but not the whole-song consonance/tension duplicated by the arc", () => {
    const metrics: AestheticMetrics = {
      consonance: { averageGradus: 4.2, consonanceScore: 0.24 },
      harmonicTension: { averageVoiceLeadingDistance: 2.5, maxVoiceLeadingDistance: 5 },
      predictability: { conditionalEntropyBits: 1.8, maxEntropyBits: Math.log2(12) },
      selfSimilarity: { bestLagNotes: 4, correlation: 0.62 },
    };
    const facts = buildAnalysisFacts(baseInput({ metrics }));
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
    const facts = buildAnalysisFacts(baseInput({ mood }));
    expect(facts).toContain("約128BPM");
    expect(facts).not.toContain("クレッシェンド");
    expect(facts).not.toContain("Russell");
    expect(facts).not.toContain("高揚・喜び");
  });

  it("labels a notated tempo as such, distinct from an autocorrelation estimate", () => {
    const mood: MoodFacts = { ...EMPTY_MOOD, tempo: { bpm: 120, confidence: "high", source: "notated" } };
    const facts = buildAnalysisFacts(baseInput({ mood }));
    expect(facts).toContain("約120BPM(楽譜に記譜された値)");
  });

  it("narrates the song as a section-by-section arc rather than a single aggregate", () => {
    const arc: ArcSection[] = [
      {
        startSec: 0,
        endSec: 4,
        consonance: { averageGradus: 4, consonanceScore: 0.25 },
        harmonicTension: { averageVoiceLeadingDistance: 1, maxVoiceLeadingDistance: 1 },
        dynamics: { averageLoudness: 0.2, dynamicRange: 0.1, trend: "stable" },
        valence: 0.5,
        arousal: -0.5,
      },
      {
        startSec: 4,
        endSec: 8,
        consonance: { averageGradus: 11, consonanceScore: 0.09 },
        harmonicTension: { averageVoiceLeadingDistance: 3, maxVoiceLeadingDistance: 3 },
        dynamics: { averageLoudness: 0.9, dynamicRange: 0.3, trend: "crescendo" },
        valence: -0.5,
        arousal: 0.6,
      },
    ];
    const facts = buildAnalysisFacts(baseInput({ arc, durationSec: 8 }));
    expect(facts).toContain("曲の推移");
    expect(facts).toContain("0:00-0:04");
    expect(facts).toContain("0:04-0:08");
    expect(facts).toContain("協和度平均Γ=4.00");
    expect(facts).toContain("協和度平均Γ=11.00");
    expect(facts).toContain("穏やか・安らぎ");
    expect(facts).toContain("緊張・不安");
  });

  it("still works with meter/counterpoint/includedParts omitted", () => {
    const facts = buildAnalysisFacts(baseInput());
    expect(facts).not.toContain("シンコペーション");
    expect(facts).not.toContain("対位法");
    expect(facts).not.toContain("解析対象パート");
  });

  it("includes the meter/syncopation section when meter is present", () => {
    const meter: MeterAnalysisResult = {
      meterSummary: [{ time: 0, numerator: 4, denominator: 4, beatWeights: [] }],
      syncopation: { rawScore: 3, maxPossibleScore: 5, normalizedScore: 0.6, averageContributionPerPair: 3, pairCount: 1 },
      harmonicRhythmAlignment: null,
    };
    const facts = buildAnalysisFacts(baseInput({ meter }));
    expect(facts).toContain("シンコペーション指数: 0.60");
    expect(facts).toContain("4/4拍子");
  });

  it("omits the meter section entirely when meter is null (audio-transcribed input)", () => {
    const facts = buildAnalysisFacts(baseInput({ meter: null }));
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
    const facts = buildAnalysisFacts(baseInput({ counterpoint }));
    expect(facts).toContain("Soprano - Alto");
    expect(facts).toContain("反行50%");
    expect(facts).toContain("平行5度2回");
  });

  it("states which parts the analysis covers when includedParts is given", () => {
    const facts = buildAnalysisFacts(baseInput({ includedParts: ["Guitar", "Bass"] }));
    expect(facts).toContain("解析対象パート: Guitar、Bass");
  });

  it("omits the included-parts line when includedParts is empty", () => {
    const facts = buildAnalysisFacts(baseInput({ includedParts: [] }));
    expect(facts).not.toContain("解析対象パート");
  });

  it("includes the notated key signature as ground truth, distinct from the estimated key timeline", () => {
    const notatedKeyTimeline: NotatedKeyPoint[] = [{ time: 0, tonic: 7, mode: "major" }];
    const facts = buildAnalysisFacts(baseInput({ notatedKeyTimeline, durationSec: 10 }));
    expect(facts).toContain("記譜上の調号");
    expect(facts).toContain("0:00-0:10 G");
  });

  it("omits the notated key section when absent", () => {
    const facts = buildAnalysisFacts(baseInput());
    expect(facts).not.toContain("記譜上の調号");
  });

  it("summarizes the Fourier/diatonicity trend, or 'no data' when empty", () => {
    const fourierTimeline: FourierTimelinePoint[] = [
      { time: 0, coefficients: [{ k: 5, magnitude: 1, normalizedMagnitude: 0.2, phase: 0 }] },
      { time: 4, coefficients: [{ k: 5, magnitude: 1, normalizedMagnitude: 0.8, phase: 0 }] },
    ];
    const withData = buildAnalysisFacts(baseInput({ fourierTimeline }));
    expect(withData).toContain("ダイアトニック度");
    expect(withData).toContain("平均0.50");
    expect(withData).toContain("最小0.20");
    expect(withData).toContain("最大0.80");

    const withoutData = buildAnalysisFacts(baseInput());
    expect(withoutData).toContain("ダイアトニック度: データなし");
  });

  it("includes score-consistency warnings when present", () => {
    const scoreWarnings: ScoreConsistencyWarning[] = [{ type: "tempo", message: "テンポが一致しません" }];
    const facts = buildAnalysisFacts(baseInput({ scoreWarnings }));
    expect(facts).toContain("整合性の警告");
    expect(facts).toContain("テンポが一致しません");
  });

  it("omits the score-warnings section when absent/empty", () => {
    expect(buildAnalysisFacts(baseInput())).not.toContain("整合性の警告");
    expect(buildAnalysisFacts(baseInput({ scoreWarnings: [] }))).not.toContain("整合性の警告");
  });

  it("includes melodic range when present", () => {
    const melodicRange: MelodicRange = { minMidi: 60, maxMidi: 72, meanMidi: 66, rangeSemitones: 12 };
    const facts = buildAnalysisFacts(baseInput({ melodicRange }));
    expect(facts).toContain("旋律の音域");
    expect(facts).toContain("12半音");
  });

  it("omits melodic range when null", () => {
    expect(buildAnalysisFacts(baseInput({ melodicRange: null }))).not.toContain("旋律の音域");
  });

  it("includes the climax section when present", () => {
    const climax: ClimaxEstimate = { sectionIndex: 1, startSec: 4, endSec: 8, score: 2.5 };
    const facts = buildAnalysisFacts(baseInput({ climax }));
    expect(facts).toContain("山場の仮説");
    expect(facts).toContain("第2区間");
    expect(facts).toContain("0:04-0:08");
  });

  it("omits the climax section when null", () => {
    expect(buildAnalysisFacts(baseInput({ climax: null }))).not.toContain("山場");
  });

  it("includes modulation events when present", () => {
    const modulations: ModulationEvent[] = [
      { time: 10, fromTonic: 0, fromMode: "major", toTonic: 7, toMode: "major", relationship: "dominant", lowConfidence: false },
    ];
    const facts = buildAnalysisFacts(baseInput({ modulations }));
    expect(facts).toContain("転調");
    expect(facts).toContain("C → G");
    expect(facts).toContain("属調");
  });

  it("omits modulations when absent/empty", () => {
    expect(buildAnalysisFacts(baseInput())).not.toContain("転調");
    expect(buildAnalysisFacts(baseInput({ modulations: [] }))).not.toContain("転調");
  });

  it("includes chord functions as a Roman-numeral sequence when present", () => {
    const chordFunctions: ChordFunctionPoint[] = [
      { time: 0, root: 0, chordMode: "major", keyTonic: 0, keyMode: "major", romanNumeral: "I" },
      { time: 2, root: 7, chordMode: "major", keyTonic: 0, keyMode: "major", romanNumeral: "V" },
    ];
    const facts = buildAnalysisFacts(baseInput({ chordFunctions }));
    expect(facts).toContain("和音の機能");
    expect(facts).toContain("I → V");
  });

  it("omits chord functions when absent/empty", () => {
    expect(buildAnalysisFacts(baseInput())).not.toContain("和音の機能");
    expect(buildAnalysisFacts(baseInput({ chordFunctions: [] }))).not.toContain("和音の機能");
  });

  it("includes the song-form section map and any recurrence call-outs when present", () => {
    const songForm: SongFormResult = {
      sections: [
        { startSec: 0, endSec: 6, group: "A" },
        { startSec: 6, endSec: 12, group: "B" },
        { startSec: 60, endSec: 66, group: "A" },
      ],
      recurrences: [{ a: { startSec: 0, endSec: 6 }, b: { startSec: 60, endSec: 66 }, similarity: 0.9 }],
    };
    const facts = buildAnalysisFacts(baseInput({ songForm }));
    expect(facts).toContain("曲の構成の仮説");
    expect(facts).toContain("A(0:00-0:06) → B(0:06-0:12) → A(1:00-1:06)");
    expect(facts).toContain("0:00-0:06の音使いが1:00-1:06にも");
  });

  it("omits song form when null", () => {
    expect(buildAnalysisFacts(baseInput({ songForm: null }))).not.toContain("曲の構成");
  });

  it("includes the pitch-class distribution and names a high-confidence scale fit", () => {
    const pitchClassDistribution: PitchClassShare[] = [
      { pitchClass: 4, share: 0.464 },
      { pitchClass: 2, share: 0.189 },
    ];
    const scaleFit: ScaleFitEstimate = { root: 4, scaleName: "minorPentatonic", pitchClasses: [2, 4, 7, 9, 11], coverage: 1, confidence: "high" };
    const facts = buildAnalysisFacts(baseInput({ pitchClassDistribution, scaleFit }));
    expect(facts).toContain("使用音(ピッチクラス)の分布");
    expect(facts).toContain("E 46.4%");
    expect(facts).toContain("Eマイナーペンタトニックスケール");
  });

  it("omits the scale-fit sentence when confidence is low, but still lists the distribution", () => {
    const pitchClassDistribution: PitchClassShare[] = [{ pitchClass: 4, share: 1 }];
    const scaleFit: ScaleFitEstimate = { root: 0, scaleName: "wholeTone", pitchClasses: [], coverage: 0.4, confidence: "low" };
    const facts = buildAnalysisFacts(baseInput({ pitchClassDistribution, scaleFit }));
    expect(facts).toContain("使用音(ピッチクラス)の分布");
    expect(facts).not.toContain("スケールの構成音とほぼ一致");
  });

  it("omits the pitch-class distribution section when empty", () => {
    expect(buildAnalysisFacts(baseInput())).not.toContain("使用音(ピッチクラス)");
  });

  it("includes the note-value breakdown when present", () => {
    const noteValueBreakdown: NoteValueCount[] = [
      { name: "sixteenth", count: 68 },
      { name: "eighth", count: 29 },
    ];
    const facts = buildAnalysisFacts(baseInput({ noteValueBreakdown }));
    expect(facts).toContain("音価の内訳");
    expect(facts).toContain("16分音符: 68音");
    expect(facts).toContain("8分音符: 29音");
  });

  it("omits the note-value breakdown when absent/empty", () => {
    expect(buildAnalysisFacts(baseInput())).not.toContain("音価の内訳");
    expect(buildAnalysisFacts(baseInput({ noteValueBreakdown: [] }))).not.toContain("音価の内訳");
  });

  it("includes the instrument build-up, translating the percussion sentinel and sorting by entry order", () => {
    const instrumentBuildUp: InstrumentBuildUp = {
      segmentDurationSec: 1,
      parts: [
        { partLabel: "Bass", countsBySegment: [0, 0, 3, 4, 0, 0, 0, 0], firstActiveSegment: 2 },
        { partLabel: "Guitar", countsBySegment: [5, 5, 5, 5, 0, 0, 0, 0], firstActiveSegment: 0 },
        { partLabel: PERCUSSION_PART_LABEL, countsBySegment: [0, 0, 3, 3, 0, 0, 0, 0], firstActiveSegment: 2 },
      ],
    };
    const facts = buildAnalysisFacts(baseInput({ instrumentBuildUp }));
    expect(facts).toContain("楽器編成の厚みの推移");
    expect(facts).toContain("Guitar: 曲の冒頭から参加");
    expect(facts).toContain("打楽器");
    expect(facts.indexOf("Guitar")).toBeLessThan(facts.indexOf("Bass"));
  });

  it("omits the instrument build-up when null", () => {
    expect(buildAnalysisFacts(baseInput({ instrumentBuildUp: null }))).not.toContain("楽器編成の厚み");
  });
});
