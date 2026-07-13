"use client";

import { useMemo, useRef, useState } from "react";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import { generateTonnetzGrid, trianglesForRhombus, triangleCentroid, chordLabel } from "@/lib/theory/tonnetz";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { chartsDict } from "@/lib/i18n/dict/charts";

interface TonnetzViewProps {
  trajectory: TonnetzTimelinePoint[];
}

interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const U_RANGE: [number, number] = [-3, 3];
const V_RANGE: [number, number] = [-2, 2];
const PADDING = 40;
// Padding around just the trajectory's own bounding box, for the default
// "fit to what's actually plotted" view -- tighter than the full-lattice
// padding above since there's far less content to frame.
const FIT_PADDING = 60;
const MIN_VIEW_WIDTH = 120;
const ZOOM_IN_FACTOR = 0.9;
const ZOOM_OUT_FACTOR = 1.1;

const SERIES_COLOR_LIGHT = "#2a78d6";
const LOW_CONFIDENCE_OPACITY = 0.4;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Static Tonnetz lattice as recessive "map" ink, with the song's chord
 * progression drawn as the one piece of real data on top: a single-hue
 * path connecting triangle centroids in chronological order. Per the
 * dataviz skill, the background (grid lines, node dots, faint triangle
 * tint) stays muted so it reads as geometry, not as competing series.
 *
 * The full lattice is drawn every time, but the default viewport fits just
 * the trajectory's own bounding box rather than the whole grid -- most
 * songs only ever touch a handful of the lattice's triangles, so showing
 * the full 7x4 tiling by default is mostly irrelevant ink. Drag-to-pan and
 * scroll-to-zoom let the viewer explore the wider lattice on their own
 * terms instead of the component guessing what else might be worth seeing.
 */
export default function TonnetzView({ trajectory }: TonnetzViewProps) {
  const t = useDict(chartsDict).tonnetzView;
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragState = useRef<{ startClientX: number; startClientY: number; startViewBox: ViewBox } | null>(null);

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
  const fullWidth = bounds.maxX - bounds.minX;

  const pathPoints = useMemo(
    () =>
      trajectory.map((point, i) => {
        // Find the triangle matching this chord's root+mode among all rhombi.
        const triangle = rhombi.find((tri) => tri.root === point.chord.root && tri.mode === point.chord.mode) ?? rhombi[0];
        const centroid = triangleCentroid(triangle);
        return { ...centroid, point, index: i };
      }),
    [trajectory, rhombi]
  );

  const fitViewBox = useMemo((): ViewBox => {
    if (pathPoints.length === 0) {
      return { x: bounds.minX, y: bounds.minY, width: fullWidth, height: bounds.maxY - bounds.minY };
    }
    const xs = pathPoints.map((p) => p.x);
    const ys = pathPoints.map((p) => p.y);
    const minX = Math.min(...xs) - FIT_PADDING;
    const maxX = Math.max(...xs) + FIT_PADDING;
    const minY = Math.min(...ys) - FIT_PADDING;
    const maxY = Math.max(...ys) + FIT_PADDING;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }, [pathPoints, bounds, fullWidth]);

  const [viewBox, setViewBox] = useState<ViewBox>(fitViewBox);
  // Re-fit whenever a new trajectory produces a different default -- e.g.
  // switching to a different song without this component unmounting. This
  // is React's documented "adjust state during render" pattern: comparing
  // against a previous value held in state (not a ref) and calling
  // setState conditionally here lets the reset happen before the stale
  // viewBox ever paints, without an extra effect round-trip.
  const [lastFitViewBox, setLastFitViewBox] = useState(fitViewBox);
  if (lastFitViewBox !== fitViewBox) {
    setLastFitViewBox(fitViewBox);
    setViewBox(fitViewBox);
  }

  if (trajectory.length === 0) {
    return <p className="text-sm text-zinc-400">{t.empty}</p>;
  }

  const linePath = pathPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cursorX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const cursorY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;

    const factor = e.deltaY > 0 ? ZOOM_OUT_FACTOR : ZOOM_IN_FACTOR;
    const newWidth = clamp(viewBox.width * factor, MIN_VIEW_WIDTH, fullWidth);
    const scale = newWidth / viewBox.width;
    const newHeight = viewBox.height * scale;

    setViewBox({
      x: cursorX - (cursorX - viewBox.x) * scale,
      y: cursorY - (cursorY - viewBox.y) * scale,
      width: newWidth,
      height: newHeight,
    });
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    dragState.current = { startClientX: e.clientX, startClientY: e.clientY, startViewBox: viewBox };
  };

  const endDrag = () => {
    dragState.current = null;
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();

    // The primary button can be released outside the SVG, where onMouseUp
    // never fires -- treat "button no longer held" as the drag having ended.
    if (dragState.current && (e.buttons & 1) === 0) {
      endDrag();
    }

    if (dragState.current) {
      const { startClientX, startClientY, startViewBox } = dragState.current;
      const dxSvg = ((e.clientX - startClientX) / rect.width) * startViewBox.width;
      const dySvg = ((e.clientY - startClientY) / rect.height) * startViewBox.height;
      setViewBox({ ...startViewBox, x: startViewBox.x - dxSvg, y: startViewBox.y - dySvg });
      setHoverIndex(null);
      return;
    }

    const mouseX = viewBox.x + ((e.clientX - rect.left) / rect.width) * viewBox.width;
    const mouseY = viewBox.y + ((e.clientY - rect.top) / rect.height) * viewBox.height;
    let nearest = 0;
    let nearestDist = Infinity;
    pathPoints.forEach((p, i) => {
      const d = Math.hypot(p.x - mouseX, p.y - mouseY);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    });
    // Hit-test radius scales with the current zoom level so it stays easy
    // to hit whether zoomed in or out.
    setHoverIndex(nearestDist < 40 * (viewBox.width / fitViewBox.width) ? nearest : null);
  };

  const hovered = hoverIndex != null ? pathPoints[hoverIndex] : null;

  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{t.label}</span>
        <div className="flex items-center gap-2">
          {hovered && (
            <span className="font-mono">
              {formatTime(hovered.point.time)} — {chordLabel(hovered.point.chord)}
              {hovered.point.chord.confidence === "low" && t.lowConfidence}
            </span>
          )}
          <button
            onClick={() => setViewBox(fitViewBox)}
            className="shrink-0 rounded-full border border-zinc-300 px-2.5 py-0.5 text-zinc-600 transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/[.06]"
          >
            {t.fit}
          </button>
        </div>
      </div>
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="w-full cursor-grab active:cursor-grabbing"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMove}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          endDrag();
          setHoverIndex(null);
        }}
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
          {t.start} {chordLabel(pathPoints[0].point.chord)}
          {pathPoints[0].point.chord.confidence === "low" && t.lowConfidenceMark}
        </text>
        <text
          x={pathPoints[pathPoints.length - 1].x}
          y={pathPoints[pathPoints.length - 1].y - 14}
          fontSize={10}
          textAnchor="middle"
          className="fill-zinc-600 font-semibold dark:fill-zinc-300"
        >
          {t.end} {chordLabel(pathPoints[pathPoints.length - 1].point.chord)}
          {pathPoints[pathPoints.length - 1].point.chord.confidence === "low" && t.lowConfidenceMark}
        </text>
      </svg>
    </div>
  );
}
