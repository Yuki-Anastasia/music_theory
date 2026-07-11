"use client";

import { useMemo, useState } from "react";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import { generateTonnetzGrid, trianglesForRhombus, triangleCentroid, chordLabel } from "@/lib/theory/tonnetz";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";

interface TonnetzViewProps {
  trajectory: TonnetzTimelinePoint[];
}

const U_RANGE: [number, number] = [-3, 3];
const V_RANGE: [number, number] = [-2, 2];
const PADDING = 40;

const SERIES_COLOR_LIGHT = "#2a78d6";
const LOW_CONFIDENCE_OPACITY = 0.4;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Static Tonnetz lattice as recessive "map" ink, with the song's chord
 * progression drawn as the one piece of real data on top: a single-hue
 * path connecting triangle centroids in chronological order. Per the
 * dataviz skill, the background (grid lines, node dots, faint triangle
 * tint) stays muted so it reads as geometry, not as competing series.
 */
export default function TonnetzView({ trajectory }: TonnetzViewProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const nodes = useMemo(() => generateTonnetzGrid(U_RANGE, V_RANGE), []);
  const rhombi = useMemo(() => {
    const list: ReturnType<typeof trianglesForRhombus> = [];
    for (let v = V_RANGE[0]; v < V_RANGE[1]; v++) {
      for (let u = U_RANGE[0]; u < U_RANGE[1]; u++) {
        list.push(...trianglesForRhombus(u, v));
      }
    }
    return list;
  }, []);

  const bounds = useMemo(() => {
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    return {
      minX: Math.min(...xs) - PADDING,
      maxX: Math.max(...xs) + PADDING,
      minY: Math.min(...ys) - PADDING,
      maxY: Math.max(...ys) + PADDING,
    };
  }, [nodes]);

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (trajectory.length === 0) {
    return <p className="text-sm text-zinc-400">和音を推定できるだけの音符がありません。</p>;
  }

  const pathPoints = trajectory.map((point, i) => {
    // Find the triangle matching this chord's root+mode among all rhombi.
    const triangle =
      rhombi.find((t) => t.root === point.chord.root && t.mode === point.chord.mode) ?? rhombi[0];
    const centroid = triangleCentroid(triangle);
    return { ...centroid, point, index: i };
  });

  const linePath = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = bounds.minX + ((e.clientX - rect.left) / rect.width) * width;
    const mouseY = bounds.minY + ((e.clientY - rect.top) / rect.height) * height;
    let nearest = 0;
    let nearestDist = Infinity;
    pathPoints.forEach((p, i) => {
      const d = Math.hypot(p.x - mouseX, p.y - mouseY);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    setHoverIndex(nearestDist < 40 ? nearest : null);
  };

  const hovered = hoverIndex != null ? pathPoints[hoverIndex] : null;

  return (
    <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="mb-1 flex justify-between text-xs text-zinc-500">
        <span>Tonnetz軌跡(薄い点=確信度低、色が濃いほど後の時刻)</span>
        {hovered && (
          <span className="font-mono">
            {formatTime(hovered.point.time)} — {chordLabel(hovered.point.chord)}
            {hovered.point.chord.confidence === "low" && "(確信度低)"}
          </span>
        )}
      </div>
      <svg
        viewBox={`${bounds.minX} ${bounds.minY} ${width} ${height}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Static lattice: hairline edges, muted node dots + labels — this is the map, not data. */}
        <g className="text-zinc-200 dark:text-zinc-800" stroke="currentColor" strokeWidth={1} fill="none">
          {rhombi.map((tri, i) => {
            const pts = tri.nodes.map((n) => {
              const found = nodes.find((no) => no.u === n.u && no.v === n.v);
              return found ?? { x: 0, y: 0 };
            });
            return <polygon key={i} points={pts.map((p) => `${p.x},${p.y}`).join(" ")} />;
          })}
        </g>
        {nodes.map((n, i) => (
          <g key={i}>
            <circle cx={n.x} cy={n.y} r={3} className="fill-zinc-300 dark:fill-zinc-700" />
            <text x={n.x} y={n.y - 8} fontSize={9} textAnchor="middle" className="fill-zinc-400">
              {PITCH_CLASS_NAMES[n.pitchClass]}
            </text>
          </g>
        ))}

        {/* Data: the chord trajectory, one hue, chronological opacity ramp. */}
        <path d={linePath} fill="none" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" strokeWidth={2} />
        {pathPoints.map((p, i) => {
          const chronologicalOpacity = 0.35 + 0.65 * (i / Math.max(1, pathPoints.length - 1));
          const isLowConfidence = p.point.chord.confidence === "low";
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={i === hoverIndex ? 7 : 5}
              fill={SERIES_COLOR_LIGHT}
              className="dark:fill-[#3987e5]"
              opacity={isLowConfidence ? LOW_CONFIDENCE_OPACITY : chronologicalOpacity}
            />
          );
        })}

        {/* Direct labels: only start and end, per "label selectively". A
            low-confidence endpoint (e.g. a solo bass note before harmony
            enters, or a fade-out tail) is labeled as uncertain rather than
            asserted as a confident start/end chord. */}
        <text
          x={pathPoints[0].x}
          y={pathPoints[0].y - 14}
          fontSize={10}
          textAnchor="middle"
          className="fill-zinc-600 font-semibold dark:fill-zinc-300"
        >
          開始 {chordLabel(pathPoints[0].point.chord)}
          {pathPoints[0].point.chord.confidence === "low" && "?(確信度低)"}
        </text>
        <text
          x={pathPoints[pathPoints.length - 1].x}
          y={pathPoints[pathPoints.length - 1].y - 14}
          fontSize={10}
          textAnchor="middle"
          className="fill-zinc-600 font-semibold dark:fill-zinc-300"
        >
          終了 {chordLabel(pathPoints[pathPoints.length - 1].point.chord)}
          {pathPoints[pathPoints.length - 1].point.chord.confidence === "low" && "?(確信度低)"}
        </text>
      </svg>
    </div>
  );
}
