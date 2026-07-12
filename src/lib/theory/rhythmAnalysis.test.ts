import { describe, it, expect } from "vitest";
import { estimateTempo, rhythmicEntropy } from "./rhythmAnalysis";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.2, midiNote: 60, pitchClass: 0, confidence: 1 };
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
