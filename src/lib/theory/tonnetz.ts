import { PITCH_CLASS_NAMES } from "../audio/pitch";

export type TriadMode = "major" | "minor";

export interface TonnetzNode {
  u: number;
  v: number;
  pitchClass: number;
  x: number;
  y: number;
}

export interface ChordEstimate {
  root: number; // pitch class 0-11
  mode: TriadMode;
  /** Fraction (0-1) of the histogram's total weight covered by this triad's 3 tones. */
  coverage: number;
  confidence: "high" | "low";
}

// Grid spacing for screen-space layout (arbitrary units; components scale as needed).
const DX = 60;
const DY = 52;

/** pc(u,v) = (7u + 4v) mod 12 — the standard Euler/Cohn Tonnetz lattice (fifths x major thirds). */
export function pitchClassAt(u: number, v: number): number {
  return (((7 * u + 4 * v) % 12) + 12) % 12;
}

export function nodeScreenPosition(u: number, v: number): { x: number; y: number } {
  return { x: u * DX + v * (DX / 2), y: -v * DY };
}

/** Generates a finite tile of the (infinite/toroidal) lattice for rendering. */
export function generateTonnetzGrid(uRange: [number, number], vRange: [number, number]): TonnetzNode[] {
  const nodes: TonnetzNode[] = [];
  for (let v = vRange[0]; v <= vRange[1]; v++) {
    for (let u = uRange[0]; u <= uRange[1]; u++) {
      const { x, y } = nodeScreenPosition(u, v);
      nodes.push({ u, v, pitchClass: pitchClassAt(u, v), x, y });
    }
  }
  return nodes;
}

export interface Triangle {
  mode: TriadMode;
  root: number;
  nodes: [{ u: number; v: number }, { u: number; v: number }, { u: number; v: number }];
}

/** Both triangles (major + minor) inside the unit rhombus anchored at (u,v). */
export function trianglesForRhombus(u: number, v: number): Triangle[] {
  return [
    {
      mode: "major",
      root: pitchClassAt(u, v),
      nodes: [
        { u, v },
        { u: u + 1, v },
        { u, v: v + 1 },
      ],
    },
    {
      mode: "minor",
      root: pitchClassAt(u, v + 1),
      nodes: [
        { u: u + 1, v },
        { u, v: v + 1 },
        { u: u + 1, v: v + 1 },
      ],
    },
  ];
}

export function triangleCentroid(triangle: Triangle): { x: number; y: number } {
  const points = triangle.nodes.map((n) => nodeScreenPosition(n.u, n.v));
  return {
    x: points.reduce((s, p) => s + p.x, 0) / 3,
    y: points.reduce((s, p) => s + p.y, 0) / 3,
  };
}

export function triadTones(root: number, mode: TriadMode): [number, number, number] {
  const third = mode === "major" ? 4 : 3;
  return [root, (root + third) % 12, (root + 7) % 12];
}

const LOW_CONFIDENCE_COVERAGE = 0.5; // below this, the 3 chord tones don't dominate the window
const CONFIDENCE_MARGIN = 0.05;

/**
 * Best-matching triad for a pitch-class histogram, scored by how much of
 * the window's total weighted duration the 3 chord tones cover — a coverage
 * fraction is more interpretable for a discrete triad than a Pearson
 * correlation against a smooth profile (that's what keyProfile.ts uses for
 * the 7-note scale case).
 */
export function detectChord(histogram: number[]): ChordEstimate {
  const total = histogram.reduce((s, v) => s + v, 0);
  if (total === 0) {
    return { root: 0, mode: "major", coverage: 0, confidence: "low" };
  }

  const candidates: { root: number; mode: TriadMode; coverage: number }[] = [];
  for (let root = 0; root < 12; root++) {
    for (const mode of ["major", "minor"] as const) {
      const tones = triadTones(root, mode);
      const covered = tones.reduce((s, pc) => s + histogram[pc], 0);
      candidates.push({ root, mode, coverage: covered / total });
    }
  }
  candidates.sort((a, b) => b.coverage - a.coverage);

  const [best, runnerUp] = candidates;
  const confidence =
    best.coverage < LOW_CONFIDENCE_COVERAGE || best.coverage - runnerUp.coverage < CONFIDENCE_MARGIN
      ? "low"
      : "high";

  return { ...best, confidence };
}

export function chordLabel(chord: Pick<ChordEstimate, "root" | "mode">): string {
  const name = PITCH_CLASS_NAMES[chord.root];
  return chord.mode === "major" ? name : `${name}m`;
}
