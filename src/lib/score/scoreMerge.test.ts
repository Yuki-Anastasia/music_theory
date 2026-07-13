import { describe, it, expect } from "vitest";
import { mergeScoreAnalyses } from "./scoreMerge";
import type { FileScoreAnalysis } from "./scoreConsistency";
import type { ScoreAnalysis } from "./musicXml";
import type { NormalizedNoteEvent } from "../theory/normalizedEvents";

function note(time: number, midiNote: number, partLabel?: string): NormalizedNoteEvent {
  return {
    time,
    durationSeconds: 0.5,
    midiNote,
    pitchClass: ((midiNote % 12) + 12) % 12,
    confidence: 1,
    ...(partLabel ? { partLabel } : {}),
  };
}

function analysis(overrides: Partial<ScoreAnalysis> = {}): ScoreAnalysis {
  return {
    events: [],
    notatedKeyTimeline: [],
    notatedChordTimeline: [],
    partNames: [],
    meterTimeline: [],
    notatedTempoBpm: null,
    percussionOnsets: [],
    ...overrides,
  };
}

describe("mergeScoreAnalyses", () => {
  it("concatenates events from all files, sorted by time", () => {
    const files: FileScoreAnalysis[] = [
      { fileName: "Guitar.gp5", analysis: analysis({ events: [note(2, 60)] }) },
      { fileName: "Bass.gp5", analysis: analysis({ events: [note(0, 40)] }) },
    ];
    const merged = mergeScoreAnalyses(files);
    expect(merged.events.map((e) => e.midiNote)).toEqual([40, 60]);
  });

  it("tags a single-part file's events with the filename, not its internal part name", () => {
    const files: FileScoreAnalysis[] = [
      {
        fileName: "Lead Guitar.musicxml",
        analysis: analysis({ events: [note(0, 60, "Guitar 1")], partNames: ["Guitar 1"] }),
      },
    ];
    const merged = mergeScoreAnalyses(files);
    expect(merged.events[0].partLabel).toBe("Lead Guitar");
    expect(merged.partNames).toEqual(["Lead Guitar"]);
  });

  it("prefixes a multi-part file's own part names with the filename for uniqueness", () => {
    const files: FileScoreAnalysis[] = [
      {
        fileName: "FullScore.musicxml",
        analysis: analysis({
          events: [note(0, 72, "Soprano"), note(0, 60, "Alto")],
          partNames: ["Soprano", "Alto"],
        }),
      },
    ];
    const merged = mergeScoreAnalyses(files);
    expect(new Set(merged.events.map((e) => e.partLabel))).toEqual(
      new Set(["FullScore - Soprano", "FullScore - Alto"])
    );
    expect(merged.partNames).toEqual(["FullScore - Soprano", "FullScore - Alto"]);
  });

  it("avoids a partLabel collision when two single-part files share an instrument name", () => {
    const files: FileScoreAnalysis[] = [
      { fileName: "Guitar1.gp5", analysis: analysis({ events: [note(0, 60, "Guitar")] }) },
      { fileName: "Guitar2.gp5", analysis: analysis({ events: [note(0, 62, "Guitar")] }) },
    ];
    const merged = mergeScoreAnalyses(files);
    expect(new Set(merged.events.map((e) => e.partLabel))).toEqual(new Set(["Guitar1", "Guitar2"]));
  });

  it("takes notatedKeyTimeline and meterTimeline from the first file only", () => {
    const files: FileScoreAnalysis[] = [
      {
        fileName: "A.musicxml",
        analysis: analysis({
          notatedKeyTimeline: [{ time: 0, tonic: 0, mode: "major" }],
          meterTimeline: [{ time: 0, numerator: 4, denominator: 4 }],
        }),
      },
      {
        fileName: "B.musicxml",
        analysis: analysis({
          notatedKeyTimeline: [{ time: 0, tonic: 7, mode: "minor" }],
          meterTimeline: [{ time: 0, numerator: 3, denominator: 4 }],
        }),
      },
    ];
    const merged = mergeScoreAnalyses(files);
    expect(merged.notatedKeyTimeline).toEqual([{ time: 0, tonic: 0, mode: "major" }]);
    expect(merged.meterTimeline).toEqual([{ time: 0, numerator: 4, denominator: 4 }]);
  });

  it("concatenates and time-sorts notatedChordTimeline across all files", () => {
    const files: FileScoreAnalysis[] = [
      { fileName: "A.musicxml", analysis: analysis({ notatedChordTimeline: [{ time: 2, label: "G" }] }) },
      { fileName: "B.musicxml", analysis: analysis({ notatedChordTimeline: [{ time: 0, label: "C" }] }) },
    ];
    const merged = mergeScoreAnalyses(files);
    expect(merged.notatedChordTimeline).toEqual([
      { time: 0, label: "C" },
      { time: 2, label: "G" },
    ]);
  });

  it("returns an empty analysis for an empty file list", () => {
    expect(mergeScoreAnalyses([])).toEqual({
      events: [],
      notatedKeyTimeline: [],
      notatedChordTimeline: [],
      partNames: [],
      meterTimeline: [],
      notatedTempoBpm: null,
      percussionOnsets: [],
    });
  });

  it("takes notatedTempoBpm from the first file only", () => {
    const files: FileScoreAnalysis[] = [
      { fileName: "A.musicxml", analysis: analysis({ notatedTempoBpm: 140 }) },
      { fileName: "B.musicxml", analysis: analysis({ notatedTempoBpm: 90 }) },
    ];
    expect(mergeScoreAnalyses(files).notatedTempoBpm).toBe(140);
  });

  it("pools percussionOnsets from every file, sorted", () => {
    const files: FileScoreAnalysis[] = [
      { fileName: "A.musicxml", analysis: analysis({ percussionOnsets: [2, 0] }) },
      { fileName: "B.musicxml", analysis: analysis({ percussionOnsets: [1] }) },
    ];
    expect(mergeScoreAnalyses(files).percussionOnsets).toEqual([0, 1, 2]);
  });
});
