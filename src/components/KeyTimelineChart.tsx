"use client";

import { useMemo, useState } from "react";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import { keyLabel } from "@/lib/theory/keyProfile";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";

interface KeyTimelineChartProps {
  timeline: KeyTimelinePoint[];
}

const WIDTH = 680;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 40 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

// Circle-of-fifths order (not chromatic): adjacent keys here are musically
// related, so a modulation between them reads as a small step rather than
// an arbitrary jump. C=0, G=7, D=2, A=9, E=4, B=11, F#=6, Db=1, Ab=8, Eb=3, Bb=10, F=5.
const CIRCLE_OF_FIFTHS_ORDER = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const TONIC_TO_ROW = new Map(CIRCLE_OF_FIFTHS_ORDER.map((tonic, row) => [tonic, row]));

const SERIES_COLOR_LIGHT = "#2a78d6";
const LOW_CONFIDENCE_OPACITY = 0.35;

function rowY(tonic: number): number {
  const row = TONIC_TO_ROW.get(tonic) ?? 0;
  return MARGIN.top + (row / 11) * PLOT_HEIGHT;
}

function timeX(time: number, maxTime: number): number {
  return MARGIN.left + (maxTime === 0 ? 0 : (time / maxTime) * PLOT_WIDTH);
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Key-over-time chart: one categorical hue (this is a single series), mode
 * (major/minor) encoded by marker shape rather than a second color axis,
 * and low-confidence estimates (near-tie between two keys) rendered at
 * reduced opacity instead of being asserted at full strength or hidden —
 * per the project's "don't assert on a close call" rule (spec D-3).
 */
export default function KeyTimelineChart({ timeline }: KeyTimelineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxTime = useMemo(
    () => (timeline.length > 0 ? timeline[timeline.length - 1].time : 0),
    [timeline]
  );

  if (timeline.length === 0) {
    return <p className="text-sm text-zinc-400">キーを推定できるだけの音符がありません。</p>;
  }

  const points = timeline.map((point) => ({
    x: timeX(point.time, maxTime),
    y: rowY(point.key.tonic),
    point,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p.x - mouseX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  const hovered = hoverIndex != null ? points[hoverIndex] : null;

  return (
    <div className="py-2">
      <div className="mb-1 flex justify-between text-xs text-zinc-500">
        <span>キーの推移(五度圏順、●=長調 / ○=短調、薄い点=確信度低)</span>
        {hovered && (
          <span className="font-mono">
            {formatTime(hovered.point.time)} — {keyLabel(hovered.point.key)}
            {hovered.point.key.confidence === "low" && "(確信度低)"}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Row gridlines, one per circle-of-fifths position, with tonic labels */}
        {CIRCLE_OF_FIFTHS_ORDER.map((tonic, row) => {
          const y = MARGIN.top + (row / 11) * PLOT_HEIGHT;
          return (
            <g key={tonic}>
              <line
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-zinc-200 dark:text-zinc-800"
                strokeWidth={1}
              />
              <text x={4} y={y + 3} fontSize={10} className="fill-zinc-500">
                {PITCH_CLASS_NAMES[tonic]}
              </text>
            </g>
          );
        })}

        {/* Time axis ticks every ~30s */}
        {Array.from({ length: Math.floor(maxTime / 30) + 1 }, (_, i) => i * 30).map((t) => (
          <text
            key={t}
            x={timeX(t, maxTime)}
            y={HEIGHT - MARGIN.bottom + 14}
            fontSize={10}
            textAnchor="middle"
            className="fill-zinc-500"
          >
            {formatTime(t)}
          </text>
        ))}

        {/* Step-ish connecting line for the single series */}
        <path d={linePath} fill="none" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" strokeWidth={2} />

        {/* One marker per window: filled = major, hollow = minor */}
        {points.map(({ x, y, point }, i) => (
          <circle
            key={i}
            cx={x}
            cy={y}
            r={i === hoverIndex ? 6 : 4}
            fill={point.key.mode === "major" ? "var(--series-color)" : "var(--surface)"}
            stroke="var(--series-color)"
            strokeWidth={2}
            opacity={point.key.confidence === "low" ? LOW_CONFIDENCE_OPACITY : 1}
            style={
              {
                "--series-color": SERIES_COLOR_LIGHT,
                "--surface": "#fcfcfb",
              } as React.CSSProperties
            }
            className="dark:[--series-color:#3987e5] dark:[--surface:#1a1a19]"
          />
        ))}

        {/* Crosshair */}
        {hovered && (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={MARGIN.top}
            y2={HEIGHT - MARGIN.bottom}
            stroke="currentColor"
            className="text-zinc-400"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
      </svg>
    </div>
  );
}
