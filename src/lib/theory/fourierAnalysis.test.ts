import { describe, it, expect } from "vitest";
import { pitchClassDFT, diatonicity } from "./fourierAnalysis";

function histogramFromPitchClasses(pitchClasses: number[]): number[] {
  const h = new Array(12).fill(0);
  pitchClasses.forEach((pc) => (h[pc] = 1));
  return h;
}

describe("pitchClassDFT", () => {
  it("D-1 spec check: a major scale's |X_5| is the largest among k=1..6", () => {
    const cMajor = histogramFromPitchClasses([0, 2, 4, 5, 7, 9, 11]);
    const coefficients = pitchClassDFT(cMajor);
    const x5 = coefficients.find((c) => c.k === 5)!;
    const others = coefficients.filter((c) => c.k >= 1 && c.k <= 6 && c.k !== 5);
    for (const other of others) {
      expect(x5.normalizedMagnitude).toBeGreaterThan(other.normalizedMagnitude);
    }
  });

  it("a whole-tone scale maximizes |X_6| among k=1..6", () => {
    const wholeTone = histogramFromPitchClasses([0, 2, 4, 6, 8, 10]);
    const coefficients = pitchClassDFT(wholeTone);
    const x6 = coefficients.find((c) => c.k === 6)!;
    const others = coefficients.filter((c) => c.k >= 1 && c.k <= 6 && c.k !== 6);
    for (const other of others) {
      expect(x6.normalizedMagnitude).toBeGreaterThanOrEqual(other.normalizedMagnitude);
    }
  });

  it("a single pitch class has magnitude 1 at every k (a pure impulse has a flat spectrum)", () => {
    const singleNote = histogramFromPitchClasses([0]);
    const coefficients = pitchClassDFT(singleNote);
    for (const c of coefficients) {
      expect(c.normalizedMagnitude).toBeCloseTo(1, 6);
    }
  });

  it("returns 0 magnitude for a silent (all-zero) histogram", () => {
    const coefficients = pitchClassDFT(new Array(12).fill(0));
    for (const c of coefficients) {
      expect(c.normalizedMagnitude).toBe(0);
    }
  });
});

describe("diatonicity", () => {
  it("is higher for a major scale than for a chromatic cluster", () => {
    const cMajor = histogramFromPitchClasses([0, 2, 4, 5, 7, 9, 11]);
    const cluster = histogramFromPitchClasses([0, 1, 2, 3, 4, 5, 6]); // 7 adjacent semitones
    expect(diatonicity(cMajor)).toBeGreaterThan(diatonicity(cluster));
  });
});
