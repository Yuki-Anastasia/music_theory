import { sineWavePath } from "./wavePath";

const WIDTH = 900;
const HEIGHT = 260;
const STAFF_Y = [70, 95, 120, 145, 170];

// Amplitude stays 0 until the wave should begin, then eases up
// (smoothstep) to its target — this is what makes the staff line read as
// "becoming" the curve rather than the curve just starting abruptly.
function rampedAmplitude(target: number, rampStartFraction: number, rampEndFraction: number) {
  return (fraction: number) => {
    if (fraction <= rampStartFraction) return 0;
    if (fraction >= rampEndFraction) return target;
    const t = (fraction - rampStartFraction) / (rampEndFraction - rampStartFraction);
    const smooth = t * t * (3 - 2 * t);
    return target * smooth;
  };
}

const NODE_CLUSTER: { x: number; y: number; r: number; opacity: number }[] = [
  { x: 660, y: 110, r: 1.4, opacity: 0.3 },
  { x: 700, y: 150, r: 1.6, opacity: 0.4 },
  { x: 740, y: 95, r: 1.8, opacity: 0.5 },
  { x: 780, y: 140, r: 2.0, opacity: 0.65 },
  { x: 820, y: 105, r: 2.2, opacity: 0.8 },
  { x: 860, y: 135, r: 2.4, opacity: 0.9 },
];
const NODE_EDGES: [number, number][] = [
  [0, 1], [1, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 5],
];

/**
 * The hero's single large composition: staff lines (left) dissolve into
 * two sine/harmonic curves (middle) that resolve into a small node lattice
 * (right) — "notation becoming mathematics" as one continuous shape.
 */
export default function HeroNotationMotif({ className }: { className?: string }) {
  const waveA = sineWavePath(WIDTH, STAFF_Y[1], 5, rampedAmplitude(26, 0.32, 0.5));
  const waveB = sineWavePath(WIDTH, STAFF_Y[3], 8, rampedAmplitude(16, 0.32, 0.5), Math.PI / 4);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      className={`pointer-events-none ${className ?? ""}`}
    >
      <defs>
        <linearGradient id="hero-staff-fade" gradientUnits="userSpaceOnUse" x1={260} y1={0} x2={380} y2={0}>
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Left: staff lines + sparse notes, fading out into the transition zone */}
      <g stroke="url(#hero-staff-fade)" strokeWidth={1}>
        {STAFF_Y.map((y) => (
          <line key={y} x1={0} y1={y} x2={420} y2={y} />
        ))}
      </g>
      <g fill="currentColor" opacity={0.9}>
        <ellipse cx={90} cy={STAFF_Y[3]} rx={5} ry={3.5} transform={`rotate(-18 90 ${STAFF_Y[3]})`} />
        <line x1={95} y1={STAFF_Y[3] - 1} x2={95} y2={STAFF_Y[0] - 6} stroke="currentColor" strokeWidth={1.1} />

        <ellipse cx={190} cy={STAFF_Y[1]} rx={5} ry={3.5} transform={`rotate(-18 190 ${STAFF_Y[1]})`} />
        <line x1={195} y1={STAFF_Y[1] + 1} x2={195} y2={STAFF_Y[4] + 6} stroke="currentColor" strokeWidth={1.1} />
      </g>

      {/* Middle: two staff lines continue on as sine/harmonic curves */}
      <g fill="none" stroke="currentColor" opacity={0.85}>
        <path d={waveA} strokeWidth={1.4} />
        <path d={waveB} strokeWidth={1} opacity={0.7} />
      </g>

      {/* Right: the curves resolve into a small Tonnetz-like node lattice */}
      <g stroke="currentColor" strokeWidth={0.75}>
        {NODE_EDGES.map(([a, b], i) => {
          const n1 = NODE_CLUSTER[a];
          const n2 = NODE_CLUSTER[b];
          return (
            <line
              key={i}
              x1={n1.x}
              y1={n1.y}
              x2={n2.x}
              y2={n2.y}
              opacity={Math.min(n1.opacity, n2.opacity)}
            />
          );
        })}
      </g>
      <g fill="currentColor">
        {NODE_CLUSTER.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={n.r} opacity={n.opacity} />
        ))}
      </g>
    </svg>
  );
}
