import { describe, it, expect } from "vitest";
import {
  pitchClassAt,
  trianglesForRhombus,
  detectChord,
  chordLabel,
} from "./tonnetz";

function histogramFromWeighted(entries: [number, number][]): number[] {
  const h = new Array(12).fill(0);
  for (const [pc, weight] of entries) h[pc] = weight;
  return h;
}

describe("pitchClassAt", () => {
  it("origin (0,0) is pitch class 0 (C)", () => {
    expect(pitchClassAt(0, 0)).toBe(0);
  });

  it("moving +1 in u is a perfect fifth (+7)", () => {
    expect(pitchClassAt(1, 0)).toBe(7);
  });

  it("moving +1 in v is a major third (+4)", () => {
    expect(pitchClassAt(0, 1)).toBe(4);
  });

  it("wraps correctly for negative coordinates", () => {
    expect(pitchClassAt(-1, 0)).toBe(5); // -7 mod 12 = 5
  });
});

describe("trianglesForRhombus", () => {
  it("the upper triangle at origin is the C major triad {0,4,7}", () => {
    const [major] = trianglesForRhombus(0, 0);
    expect(major.mode).toBe("major");
    expect(major.root).toBe(0);
    const pcs = major.nodes.map((n) => pitchClassAt(n.u, n.v)).sort((a, b) => a - b);
    expect(pcs).toEqual([0, 4, 7]);
  });

  it("the lower triangle at origin is an E minor triad (root=4, tones {4,7,11})", () => {
    const [, minor] = trianglesForRhombus(0, 0);
    expect(minor.mode).toBe("minor");
    expect(minor.root).toBe(4);
    const pcs = minor.nodes.map((n) => pitchClassAt(n.u, n.v)).sort((a, b) => a - b);
    expect(pcs).toEqual([4, 7, 11]);
  });
});

describe("detectChord", () => {
  it("D-1-style check: a histogram of exactly {0,4,7} resolves to C major", () => {
    const histogram = histogramFromWeighted([
      [0, 1],
      [4, 1],
      [7, 1],
    ]);
    const chord = detectChord(histogram);
    expect(chord.root).toBe(0);
    expect(chord.mode).toBe("major");
    expect(chord.coverage).toBeCloseTo(1, 6);
    expect(chord.confidence).toBe("high");
  });

  it("a histogram of exactly {0,3,7} resolves to C minor", () => {
    const histogram = histogramFromWeighted([
      [0, 1],
      [3, 1],
      [7, 1],
    ]);
    const chord = detectChord(histogram);
    expect(chord.root).toBe(0);
    expect(chord.mode).toBe("minor");
  });

  it("flags low confidence for a silent histogram", () => {
    const chord = detectChord(new Array(12).fill(0));
    expect(chord.confidence).toBe("low");
  });

  it("flags low confidence when notes are spread across many unrelated pitch classes", () => {
    // a fully chromatic cluster: no 3-note triad can cover much of it
    const histogram = new Array(12).fill(1);
    const chord = detectChord(histogram);
    expect(chord.confidence).toBe("low");
  });
});

describe("chordLabel", () => {
  it("formats major without suffix, minor with 'm'", () => {
    expect(chordLabel({ root: 0, mode: "major" })).toBe("C");
    expect(chordLabel({ root: 9, mode: "minor" })).toBe("Am");
  });
});
