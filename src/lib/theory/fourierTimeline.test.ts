import { describe, it, expect } from "vitest";
import { estimateFourierTimeline } from "./fourierTimeline";
import { NormalizedNoteEvent } from "./normalizedEvents";

function makeScaleEvents(pitchClasses: number[], startTime: number, endTime: number): NormalizedNoteEvent[] {
  const span = endTime - startTime;
  const noteLen = span / pitchClasses.length;
  return pitchClasses.map((pc, i) => ({
    time: startTime + i * noteLen,
    durationSeconds: noteLen,
    midiNote: 60 + pc,
    pitchClass: pc,
    confidence: 1,
  }));
}

describe("estimateFourierTimeline", () => {
  it("returns an empty timeline for no events", () => {
    expect(estimateFourierTimeline([])).toEqual([]);
  });

  it("shows higher |X_5| for a diatonic passage than a chromatic-cluster passage", () => {
    const cMajor = [0, 2, 4, 5, 7, 9, 11];
    const cluster = [0, 1, 2, 3, 4, 5, 6];

    const diatonicSection: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) diatonicSection.push(...makeScaleEvents(cMajor, rep * 2, rep * 2 + 2));

    const clusterSection: NormalizedNoteEvent[] = [];
    for (let rep = 0; rep < 8; rep++) clusterSection.push(...makeScaleEvents(cluster, 16 + rep * 2, 16 + rep * 2 + 2));

    const timeline = estimateFourierTimeline([...diatonicSection, ...clusterSection], 8, 4);
    expect(timeline.length).toBeGreaterThan(0);

    const x5 = (coeffs: typeof timeline[number]["coefficients"]) => coeffs.find((c) => c.k === 5)!.normalizedMagnitude;
    expect(x5(timeline[0].coefficients)).toBeGreaterThan(x5(timeline[timeline.length - 1].coefficients));
  });
});
