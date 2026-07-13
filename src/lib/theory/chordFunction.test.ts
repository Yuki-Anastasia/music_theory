import { describe, it, expect } from "vitest";
import { romanNumeralFor, analyzeChordFunctions } from "./chordFunction";
import type { KeyTimelinePoint } from "./keyTimeline";
import type { TonnetzTimelinePoint } from "./tonnetzTimeline";

// Expected uppercase (major-chord) label for each semitone offset from the
// tonic, spelled out in full so the chromatic/wraparound spelling rules are
// visible as data rather than re-derived logic.
const MAJOR_KEY_ROMAN = ["I", "bII", "II", "bIII", "III", "IV", "bV", "V", "bVI", "VI", "bVII", "VII"];
const MINOR_KEY_ROMAN = ["I", "bII", "II", "III", "bIV", "IV", "bV", "V", "VI", "bVII", "VII", "#VII"];

describe("romanNumeralFor", () => {
  it("labels every semitone offset in a major key (major and minor chord case)", () => {
    for (let offset = 0; offset < 12; offset++) {
      expect(romanNumeralFor(offset, "major", 0, "major")).toBe(MAJOR_KEY_ROMAN[offset]);
      expect(romanNumeralFor(offset, "minor", 0, "major")).toBe(MAJOR_KEY_ROMAN[offset].toLowerCase());
    }
  });

  it("labels every semitone offset in a minor key (major and minor chord case), including the raised-7th wraparound", () => {
    for (let offset = 0; offset < 12; offset++) {
      expect(romanNumeralFor(offset, "major", 0, "minor")).toBe(MINOR_KEY_ROMAN[offset]);
      expect(romanNumeralFor(offset, "minor", 0, "minor")).toBe(MINOR_KEY_ROMAN[offset].toLowerCase());
    }
  });

  it("labels relative to a non-zero tonic", () => {
    // G major (tonic=7): D (offset 7 from G) is the V.
    expect(romanNumeralFor(2, "major", 7, "major")).toBe("V");
  });
});

describe("analyzeChordFunctions", () => {
  function chordPoint(time: number, root: number, mode: "major" | "minor"): TonnetzTimelinePoint {
    return { time, chord: { root, mode, coverage: 1, confidence: "high" } };
  }
  function keyPoint(time: number, tonic: number, mode: "major" | "minor"): KeyTimelinePoint {
    return { time, key: { tonic, mode, correlation: 0.9, confidence: "high" } };
  }

  it("drops chords before the first key-timeline point", () => {
    const result = analyzeChordFunctions([chordPoint(0, 0, "major")], [keyPoint(4, 0, "major")]);
    expect(result).toEqual([]);
  });

  it("resolves chords against the key active at their own time across a modulation", () => {
    const keyTimeline = [keyPoint(0, 0, "major"), keyPoint(10, 7, "major")]; // C major -> G major at t=10
    const trajectory = [
      chordPoint(2, 0, "major"), // in C major: I
      chordPoint(12, 2, "major"), // in G major: V (D major)
    ];
    const result = analyzeChordFunctions(trajectory, keyTimeline);
    expect(result).toEqual([
      expect.objectContaining({ time: 2, romanNumeral: "I", keyTonic: 0 }),
      expect.objectContaining({ time: 12, romanNumeral: "V", keyTonic: 7 }),
    ]);
  });
});
