"use client";

import { useMemo, useState } from "react";
import type { FourierTimelinePoint } from "@/lib/theory/fourierTimeline";

interface FourierTimelineChartProps {
  timeline: FourierTimelinePoint[];
}

const WIDTH = 680;
const HEIGHT = 220;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 32 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

const SERIES_COLOR_LIGHT = "#2a78d6";

const COEFFICIENT_LABELS: Record<number, string> = {
  1: "半音階的な偏り",
  3: "増三和音的",
  4: "オクタトニック的",
  5: "ダイアトニック的(五度圏)",
  6: "全音音階的",
};

function timeX(time: number, maxTime: number): number {
  return MARGIN.left + (maxTime === 0 ? 0 : (time / maxTime) * PLOT_WIDTH);
}

function valueY(value: number): number {
  return MARGIN.top + (1 - value) * PLOT_HEIGHT;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * |X_5| ("diatonicity") over time: a single-series magnitude trend, so one
 * hue with a light area wash under a 2px line, per the dataviz skill's
 * marks spec. The other coefficients (k=1,3,4,6) ride the hover tooltip as
 * a breakdown rather than becoming five more lines on the same axis.
 */
export default function FourierTimelineChart({ timeline }: FourierTimelineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const maxTime = useMemo(
    () => (timeline.length > 0 ? timeline[timeline.length - 1].time : 0),
    [timeline]
  );

  if (timeline.length === 0) {
    return <p className="text-sm text-zinc-400">解析できるだけの音符がありません。</p>;
  }

  const x5 = (point: FourierTimelinePoint) => point.coefficients.find((c) => c.k === 5)!.normalizedMagnitude;

  const points = timeline.map((point) => ({
    x: timeX(point.time, maxTime),
    y: valueY(x5(point)),
    point,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${valueY(0)} L${points[0].x},${valueY(0)} Z`;

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
  const hoveredBreakdown = hovered?.point.coefficients.filter((c) => c.k >= 1 && c.k <= 6 && c.k !== 5) ?? [];

  return (
    <div className="py-2">
      <div className="mb-1 flex justify-between text-xs text-zinc-500">
        <span>|X₅| ダイアトニック度の推移(1=五度圏上に強く集中、0=分散)</span>
        {hovered && (
          <span className="font-mono">
            {formatTime(hovered.point.time)} — |X₅|={x5(hovered.point).toFixed(2)}
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Reference gridlines at 0 / 0.5 / 1 */}
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={valueY(v)}
              y2={valueY(v)}
              stroke="currentColor"
              className="text-zinc-200 dark:text-zinc-800"
              strokeWidth={1}
            />
            <text x={4} y={valueY(v) + 3} fontSize={10} className="fill-zinc-500">
              {v}
            </text>
          </g>
        ))}

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

        {/* Area wash (~10% opacity) under the line */}
        <path d={areaPath} className="fill-[#2a78d6] dark:fill-[#3987e5]" opacity={0.1} />
        <path d={linePath} fill="none" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" strokeWidth={2} />

        {hovered && (
          <>
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
            <circle cx={hovered.x} cy={hovered.y} r={5} fill={SERIES_COLOR_LIGHT} className="dark:fill-[#3987e5]" />
          </>
        )}
      </svg>

      {hovered && (
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-zinc-100 pt-2 text-xs text-zinc-500 dark:border-zinc-800 sm:grid-cols-4">
          {hoveredBreakdown.map((c) => (
            <div key={c.k}>
              <span className="font-mono">|X{toSubscript(c.k)}|={c.normalizedMagnitude.toFixed(2)}</span>{" "}
              <span>{COEFFICIENT_LABELS[c.k]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toSubscript(n: number): string {
  const subscripts = ["₀", "₁", "₂", "₃", "₄", "₅", "₆", "₇", "₈", "₉"];
  return subscripts[n] ?? String(n);
}
