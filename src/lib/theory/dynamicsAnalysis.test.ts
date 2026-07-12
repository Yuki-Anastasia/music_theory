import { describe, it, expect } from "vitest";
import { dynamicsSummary } from "./dynamicsAnalysis";
import { NormalizedNoteEvent } from "./normalizedEvents";

function note(time: number, confidence: number): NormalizedNoteEvent {
  return { time, durationSeconds: 0.1, midiNote: 60, pitchClass: 0, confidence };
}

describe("dynamicsSummary", () => {
  it("returns zeros/stable for no events", () => {
    expect(dynamicsSummary([])).toEqual({ averageLoudness: 0, dynamicRange: 0, trend: "stable" });
  });

  it("detects a crescendo from increasing per-segment loudness", () => {
    const events = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8].map((c, i) => note(i, c));
    const result = dynamicsSummary(events);
    expect(result.trend).toBe("crescendo");
    expect(result.averageLoudness).toBeCloseTo(0.45, 5);
    expect(result.dynamicRange).toBeGreaterThan(0.5);
  });

  it("detects a diminuendo from decreasing per-segment loudness", () => {
    const events = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].map((c, i) => note(i, c));
    expect(dynamicsSummary(events).trend).toBe("diminuendo");
  });

  it("reports stable for constant loudness", () => {
    const events = Array.from({ length: 8 }, (_, i) => note(i, 0.5));
    const result = dynamicsSummary(events);
    expect(result.trend).toBe("stable");
    expect(result.dynamicRange).toBeCloseTo(0, 10);
  });
});
