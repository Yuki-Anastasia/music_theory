import { describe, it, expect } from "vitest";
import { pitchClassDistribution, estimateScaleFit } from "./pitchClassProfile";

function histogramFrom(weights: Partial<Record<number, number>>): number[] {
  const histogram = new Array(12).fill(0);
  for (const [pc, weight] of Object.entries(weights)) histogram[Number(pc)] = weight ?? 0;
  return histogram;
}

describe("pitchClassDistribution", () => {
  it("returns an empty list for a silent histogram", () => {
    expect(pitchClassDistribution(new Array(12).fill(0))).toEqual([]);
  });

  it("ranks pitch classes by share, descending, omitting unused ones", () => {
    const histogram = histogramFrom({ 4: 46.4, 2: 18.9, 9: 12.2, 7: 11.7, 11: 7.7, 1: 3.1 });
    const shares = pitchClassDistribution(histogram);
    expect(shares.map((s) => s.pitchClass)).toEqual([4, 2, 9, 7, 11, 1]);
    expect(shares[0].share).toBeCloseTo(0.464, 3);
    expect(shares.reduce((s, p) => s + p.share, 0)).toBeCloseTo(1, 6);
  });
});

describe("estimateScaleFit", () => {
  it("returns null for a silent histogram", () => {
    expect(estimateScaleFit(new Array(12).fill(0))).toBeNull();
  });

  it("identifies E minor pentatonic over its relative-major reading, using tonic emphasis as the tiebreak", () => {
    // E minor pentatonic {E,G,A,B,D} = {4,7,9,11,2} -- identical pitch-class
    // set to G major pentatonic, so only E's dominant share should decide it.
    const histogram = histogramFrom({ 4: 46.4, 2: 18.9, 9: 12.2, 7: 11.7, 11: 7.7 });
    const fit = estimateScaleFit(histogram);
    expect(fit).toMatchObject({ root: 4, scaleName: "minorPentatonic", confidence: "high" });
    expect(fit!.coverage).toBeCloseTo(1, 6);
  });

  it("prefers the more specific pentatonic reading over the 7-note scale that contains it", () => {
    // C major pentatonic {C,D,E,G,A} = {0,2,4,7,9} is also a subset of C
    // major and A natural minor -- the 5-note reading should win.
    const histogram = histogramFrom({ 0: 30, 2: 25, 4: 20, 7: 15, 9: 10 });
    const fit = estimateScaleFit(histogram);
    expect(fit).toMatchObject({ scaleName: "majorPentatonic", root: 0, confidence: "high" });
  });

  it("falls back to a low-confidence best guess when nothing covers cleanly", () => {
    // Roughly uniform across all 12 pitch classes -- no scale should reach the high-coverage threshold.
    const histogram = new Array(12).fill(1);
    const fit = estimateScaleFit(histogram);
    expect(fit?.confidence).toBe("low");
  });
});
