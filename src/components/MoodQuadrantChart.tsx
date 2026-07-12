import { describeMoodQuadrant } from "@/lib/theory/emotionEstimate";

const SIZE = 260;
const PADDING = 32;
const PLOT_SIZE = SIZE - PADDING * 2;

function toScreen(valence: number, arousal: number): { x: number; y: number } {
  return {
    x: PADDING + ((valence + 1) / 2) * PLOT_SIZE,
    y: PADDING + ((1 - arousal) / 2) * PLOT_SIZE, // arousal +1 at top
  };
}

/**
 * Russell's circumplex model of affect: valence (快/不快) on the x-axis,
 * arousal (覚醒/沈静) on the y-axis, the song plotted as a single point.
 * A hypothesis-generating estimate from surface musical features, not a
 * validated emotion-recognition result.
 */
export default function MoodQuadrantChart({ valence, arousal }: { valence: number; arousal: number }) {
  const point = toScreen(valence, arousal);
  const label = describeMoodQuadrant(valence, arousal);

  return (
    <div className="py-2">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto w-full max-w-[280px]">
        {/* map: quadrant frame + axes (muted) */}
        <rect
          x={PADDING}
          y={PADDING}
          width={PLOT_SIZE}
          height={PLOT_SIZE}
          fill="none"
          stroke="currentColor"
          className="text-zinc-300 dark:text-zinc-700"
          strokeWidth={1}
        />
        <line
          x1={PADDING}
          y1={SIZE / 2}
          x2={SIZE - PADDING}
          y2={SIZE / 2}
          stroke="currentColor"
          className="text-zinc-300 dark:text-zinc-700"
          strokeWidth={1}
        />
        <line
          x1={SIZE / 2}
          y1={PADDING}
          x2={SIZE / 2}
          y2={SIZE - PADDING}
          stroke="currentColor"
          className="text-zinc-300 dark:text-zinc-700"
          strokeWidth={1}
        />

        {/* axis labels (map ink) */}
        <text x={SIZE - PADDING} y={SIZE / 2 - 6} textAnchor="end" className="fill-zinc-400 text-[10px] dark:fill-zinc-500">
          快
        </text>
        <text x={PADDING} y={SIZE / 2 - 6} textAnchor="start" className="fill-zinc-400 text-[10px] dark:fill-zinc-500">
          不快
        </text>
        <text x={SIZE / 2 + 6} y={PADDING + 10} textAnchor="start" className="fill-zinc-400 text-[10px] dark:fill-zinc-500">
          覚醒
        </text>
        <text x={SIZE / 2 + 6} y={SIZE - PADDING} textAnchor="start" className="fill-zinc-400 text-[10px] dark:fill-zinc-500">
          沈静
        </text>

        {/* data: the song's estimated position */}
        <circle cx={point.x} cy={point.y} r={6} className="fill-[#2a78d6] dark:fill-[#3987e5]" />
      </svg>
      <p className="mt-2 text-center text-sm font-medium">{label}</p>
      <p className="mt-1 text-center text-xs text-zinc-500">
        valence {valence.toFixed(2)} / arousal {arousal.toFixed(2)}(Russellの感情円環モデルに基づく仮説的な推定)
      </p>
    </div>
  );
}
