import { describe, it, expect } from "vitest";
import { checkConsistency } from "./scoreConsistency";
import type { FileScoreAnalysis } from "./scoreConsistency";
import type { ScoreAnalysis } from "./musicXml";
import type { NormalizedNoteEvent } from "../theory/normalizedEvents";

function note(time: number, durationSeconds = 0.2, midiNote = 60): NormalizedNoteEvent {
  return { time, durationSeconds, midiNote, pitchClass: ((midiNote % 12) + 12) % 12, confidence: 1 };
}

/** A steady beat at the given bpm, long enough for estimateTempo to reach "high" confidence. */
function steadyBeat(bpm: number, count = 40): NormalizedNoteEvent[] {
  const interval = 60 / bpm;
  return Array.from({ length: count }, (_, i) => note(i * interval));
}

/** Repeats a scale many times over `repeats` 2s segments so an 8s key-detection window has strong signal. */
function scaleEvents(pitchClasses: number[], repeats: number): NormalizedNoteEvent[] {
  const events: NormalizedNoteEvent[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    const start = rep * 2;
    const noteLen = 2 / pitchClasses.length;
    pitchClasses.forEach((pc, i) => events.push(note(start + i * noteLen, noteLen, 60 + pc)));
  }
  return events;
}

const C_MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const G_MAJOR_SCALE = [7, 9, 11, 0, 2, 4, 6];

function analysis(events: NormalizedNoteEvent[], overrides: Partial<ScoreAnalysis> = {}): ScoreAnalysis {
  return {
    events,
    notatedKeyTimeline: [],
    notatedChordTimeline: [],
    partNames: [],
    meterTimeline: [],
    notatedTempoBpm: null,
    percussionOnsets: [],
    ...overrides,
  };
}

function file(fileName: string, scoreAnalysis: ScoreAnalysis): FileScoreAnalysis {
  return { fileName, analysis: scoreAnalysis };
}

describe("checkConsistency", () => {
  it("returns no warnings for fewer than 2 files", () => {
    expect(checkConsistency([file("A.gp5", analysis([note(0)]))])).toEqual([]);
    expect(checkConsistency([])).toEqual([]);
  });

  it("flags a large duration mismatch between files", () => {
    const long = analysis([note(0), note(10)]); // ~10.2s
    const short = analysis([note(0), note(1)]); // ~1.2s
    const warnings = checkConsistency([file("Guitar.gp5", long), file("Bass.musicxml", short)]);
    expect(warnings.some((w) => w.type === "duration")).toBe(true);
  });

  it("does not flag a small duration difference", () => {
    const a = analysis([note(0), note(10)]);
    const b = analysis([note(0), note(10.5)]);
    const warnings = checkConsistency([file("A.gp5", a), file("B.gp5", b)]);
    expect(warnings.some((w) => w.type === "duration")).toBe(false);
  });

  it("flags a large tempo mismatch via the estimated-tempo fallback when neither file has a notated tempo", () => {
    const fast = analysis(steadyBeat(150));
    const slow = analysis(steadyBeat(90));
    const warnings = checkConsistency([file("Guitar.gp5", fast), file("Bass.gp5", slow)]);
    expect(warnings.some((w) => w.type === "tempo")).toBe(true);
  });

  it("does not flag tempo via the estimated fallback when either file's estimate is low-confidence", () => {
    const fast = analysis(steadyBeat(150));
    const unreliable = analysis([note(0), note(0.3), note(0.9), note(2.1)]); // irregular, low confidence
    const warnings = checkConsistency([file("Guitar.gp5", fast), file("Bass.gp5", unreliable)]);
    expect(warnings.some((w) => w.type === "tempo")).toBe(false);
  });

  it("prefers the notated tempo over re-estimating it from the note pattern", () => {
    // Both files have a steady 150bpm onset pattern (which estimateTempo
    // would recover just fine), but notatedTempoBpm says otherwise for one
    // of them — the notated value must win, exactly matching "follow what's
    // written" rather than what the notes happen to look like.
    const a = analysis(steadyBeat(150), { notatedTempoBpm: 150 });
    const b = analysis(steadyBeat(150), { notatedTempoBpm: 80 });
    const warnings = checkConsistency([file("Guitar.gp5", a), file("Bass.gp5", b)]);
    expect(warnings.some((w) => w.type === "tempo")).toBe(true);
  });

  it("flags a notated-tempo mismatch even with too few notes for a reliable estimate", () => {
    // Only 2 notes each — estimateTempo would refuse to call this "high"
    // confidence, but a notated tempo doesn't need that signal at all.
    const a = analysis([note(0), note(1)], { notatedTempoBpm: 140 });
    const b = analysis([note(0), note(1)], { notatedTempoBpm: 90 });
    const warnings = checkConsistency([file("Guitar.gp5", a), file("Bass.gp5", b)]);
    expect(warnings.some((w) => w.type === "tempo")).toBe(true);
  });

  it("does not flag tempo when notated values agree, regardless of what the note pattern looks like", () => {
    const a = analysis(steadyBeat(150), { notatedTempoBpm: 120 });
    const b = analysis([note(0), note(1)], { notatedTempoBpm: 120 });
    const warnings = checkConsistency([file("Guitar.gp5", a), file("Bass.gp5", b)]);
    expect(warnings.some((w) => w.type === "tempo")).toBe(false);
  });

  it("flags a key mismatch using notated (ground-truth) keys", () => {
    const cMajor = analysis([note(0)], { notatedKeyTimeline: [{ time: 0, tonic: 0, mode: "major" }] });
    const gMajor = analysis([note(0)], { notatedKeyTimeline: [{ time: 0, tonic: 7, mode: "major" }] });
    const warnings = checkConsistency([file("Guitar.musicxml", cMajor), file("Bass.musicxml", gMajor)]);
    expect(warnings.some((w) => w.type === "key")).toBe(true);
  });

  it("flags a key mismatch using high-confidence estimated keys when not notated", () => {
    const cMajor = analysis(scaleEvents(C_MAJOR_SCALE, 8));
    const gMajor = analysis(scaleEvents(G_MAJOR_SCALE, 8));
    const warnings = checkConsistency([file("Guitar.gp5", cMajor), file("Bass.gp5", gMajor)]);
    expect(warnings.some((w) => w.type === "key")).toBe(true);
  });

  it("does not flag key when estimated confidence is low", () => {
    const ambiguous = analysis([note(0), note(1), note(2)]); // too little signal for a confident call
    const cMajor = analysis(scaleEvents(C_MAJOR_SCALE, 8));
    const warnings = checkConsistency([file("Guitar.gp5", cMajor), file("Bass.gp5", ambiguous)]);
    expect(warnings.some((w) => w.type === "key")).toBe(false);
  });

  it("flags a meter mismatch", () => {
    const fourFour = analysis([note(0)], { meterTimeline: [{ time: 0, numerator: 4, denominator: 4 }] });
    const threeFour = analysis([note(0)], { meterTimeline: [{ time: 0, numerator: 3, denominator: 4 }] });
    const warnings = checkConsistency([file("Guitar.musicxml", fourFour), file("Bass.musicxml", threeFour)]);
    expect(warnings.some((w) => w.type === "meter")).toBe(true);
  });

  it("does not flag meter when one file has no meterTimeline (e.g. a format that doesn't expose one)", () => {
    const fourFour = analysis([note(0)], { meterTimeline: [{ time: 0, numerator: 4, denominator: 4 }] });
    const noMeter = analysis([note(0)]);
    const warnings = checkConsistency([file("Guitar.musicxml", fourFour), file("Bass.gp5", noMeter)]);
    expect(warnings.some((w) => w.type === "meter")).toBe(false);
  });

  it("returns no warnings when everything is consistent", () => {
    const a = analysis(steadyBeat(120), {
      notatedKeyTimeline: [{ time: 0, tonic: 0, mode: "major" }],
      meterTimeline: [{ time: 0, numerator: 4, denominator: 4 }],
    });
    const b = analysis(steadyBeat(120), {
      notatedKeyTimeline: [{ time: 0, tonic: 0, mode: "major" }],
      meterTimeline: [{ time: 0, numerator: 4, denominator: 4 }],
    });
    expect(checkConsistency([file("A.gp5", a), file("B.gp5", b)])).toEqual([]);
  });

  it("compares every other file against the first (reference) file", () => {
    const reference = analysis([note(0), note(10)]);
    const mismatchedA = analysis([note(0), note(1)]);
    const mismatchedB = analysis([note(0), note(0.5)]);
    const warnings = checkConsistency([file("Ref.gp5", reference), file("A.gp5", mismatchedA), file("B.gp5", mismatchedB)]);
    const durationWarnings = warnings.filter((w) => w.type === "duration");
    expect(durationWarnings).toHaveLength(2);
    expect(durationWarnings.some((w) => w.message.includes("A.gp5"))).toBe(true);
    expect(durationWarnings.some((w) => w.message.includes("B.gp5"))).toBe(true);
  });
});
