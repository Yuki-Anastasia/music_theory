import { describe, it, expect } from "vitest";
import { estimateTempo, rhythmicEntropy, noteValueBreakdown } from "./rhythmAnalysis";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.2, midiNote: 60, pitchClass: 0, confidence: 1 };
}

function noteWithDuration(durationSeconds: number): NormalizedNoteEvent {
  return { time: 0, durationSeconds, midiNote: 60, pitchClass: 0, confidence: 1 };
}

describe("estimateTempo", () => {
  it("recovers 120 BPM from a perfectly regular onset sequence", () => {
    const events = Array.from({ length: 40 }, (_, i) => note(i * 0.5));
    const result = estimateTempo(events);
    expect(result.bpm).toBe(120);
    expect(result.confidence).toBe("high");
  });

  it("recovers ~90 BPM within binning tolerance", () => {
    const events = Array.from({ length: 30 }, (_, i) => note(i * (60 / 90)));
    const result = estimateTempo(events);
    expect(result.bpm).toBeGreaterThan(88);
    expect(result.bpm).toBeLessThan(92);
    expect(result.confidence).toBe("high");
  });

  it("returns low confidence for too few events", () => {
    expect(estimateTempo([note(0), note(1)]).confidence).toBe("low");
  });

  it("tags its result as an estimate, not a notated value", () => {
    const events = Array.from({ length: 40 }, (_, i) => note(i * 0.5));
    expect(estimateTempo(events).source).toBe("estimated");
    expect(estimateTempo([note(0), note(1)]).source).toBe("estimated");
  });
});

describe("rhythmicEntropy", () => {
  it("is zero for perfectly regular spacing (single duration bucket)", () => {
    const events = Array.from({ length: 10 }, (_, i) => note(i * 0.5));
    const result = rhythmicEntropy(events);
    expect(result.entropyBits).toBe(0);
    expect(result.maxEntropyBits).toBe(0);
  });

  it("is positive when durations fall into multiple distinct buckets", () => {
    // Alternating short (0.25s) and long (1s) gaps -> 2 distinct log2-ratio buckets.
    const times: number[] = [0];
    for (let i = 0; i < 10; i++) {
      times.push(times[times.length - 1] + (i % 2 === 0 ? 0.25 : 1));
    }
    const events = times.map(note);
    const result = rhythmicEntropy(events);
    expect(result.entropyBits).toBeGreaterThan(0);
    expect(result.maxEntropyBits).toBeCloseTo(Math.log2(2), 10);
  });

  it("returns zeros for fewer than 2 events", () => {
    expect(rhythmicEntropy([note(0)])).toEqual({ entropyBits: 0, maxEntropyBits: 0 });
  });
});

describe("noteValueBreakdown", () => {
  const TEMPO_BPM = 120; // quarter note = 0.5s

  it("returns an empty list for no events or an unknown tempo", () => {
    expect(noteValueBreakdown([], TEMPO_BPM)).toEqual([]);
    expect(noteValueBreakdown([noteWithDuration(0.5)], 0)).toEqual([]);
  });

  it("classifies exact durations to their matching named value", () => {
    const events = [
      ...Array.from({ length: 3 }, () => noteWithDuration(0.125)), // sixteenth
      ...Array.from({ length: 2 }, () => noteWithDuration(0.25)), // eighth
      noteWithDuration(0.5), // quarter
      noteWithDuration(1.0), // half
    ];
    const breakdown = noteValueBreakdown(events, TEMPO_BPM);
    // "half" precedes "quarter" in the template catalog, and ties preserve
    // that order under a stable sort.
    expect(breakdown).toEqual([
      { name: "sixteenth", count: 3 },
      { name: "eighth", count: 2 },
      { name: "half", count: 1 },
      { name: "quarter", count: 1 },
    ]);
  });

  it("classifies a triplet-ratio duration to the nearest triplet value, not the nearest straight value", () => {
    // An eighth-note triplet is 1/3 of a beat = ~0.1667s at 120bpm -- closer
    // in log2-ratio terms to the eighth-triplet template than to a sixteenth.
    const breakdown = noteValueBreakdown([noteWithDuration(0.5 / 3)], TEMPO_BPM);
    expect(breakdown).toEqual([{ name: "eighthTriplet", count: 1 }]);
  });
});
