import { sineWavePath } from "./wavePath";

const WIDTH = 200;
const HEIGHT = 60;

/** Ambient decoration: two overlaid sine/harmonic curves. */
export default function WaveformFragment({ className }: { className?: string }) {
  const fundamental = sineWavePath(WIDTH, HEIGHT / 2, 2.5, () => 16);
  const harmonic = sineWavePath(WIDTH, HEIGHT / 2, 6, () => 6, Math.PI / 3);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none ${className ?? ""}`}
    >
      <g fill="none" stroke="currentColor">
        <path d={fundamental} strokeWidth={1.4} />
        <path d={harmonic} strokeWidth={0.8} opacity={0.6} />
      </g>
    </svg>
  );
}
