"use client";

import { useEffect, useRef, useState } from "react";
import type { NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import { midiToNoteName } from "@/lib/audio/pitch";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { chartsDict } from "@/lib/i18n/dict/charts";

interface PianoRollViewerProps {
  events: NormalizedNoteEvent[];
}

const PIXELS_PER_SECOND = 60;
const ROW_HEIGHT = 6;
const NOTE_PADDING = 2; // extra semitones of headroom above/below the data's range
const TIME_AXIS_HEIGHT = 24;
const NOTE_LABEL_GUTTER = 40;

// Sequential single-hue ramp (dataviz skill's blue ramp), one ordered set
// per surface so low-confidence notes recede toward that surface and
// high-confidence notes stand out — not a separate palette per mode.
const LIGHT_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#1c5cab", "#104281"];
const DARK_RAMP = ["#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#86b6ef"];

const LIGHT_SURFACE = "#fcfcfb";
const DARK_SURFACE = "#1a1a19";
const LIGHT_GRIDLINE = "#e1e0d9";
const DARK_GRIDLINE = "#2c2c2a";
const LIGHT_INK = "#898781";
const DARK_INK = "#898781";

function confidenceToColor(confidence: number, isDark: boolean): string {
  const ramp = isDark ? DARK_RAMP : LIGHT_RAMP;
  const index = Math.min(ramp.length - 1, Math.floor(confidence * ramp.length));
  return ramp[index];
}

/**
 * Canvas piano roll: time on X, MIDI pitch on Y, one horizontal bar per
 * note. Confidence (Basic Pitch's note amplitude) maps to a single-hue
 * sequential ramp rather than a rainbow, per the dataviz skill's color
 * formula for magnitude encoding.
 */
export default function PianoRollViewer({ events }: PianoRollViewerProps) {
  const t = useDict(chartsDict).pianoRoll;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => setIsDark(e.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const surface = isDark ? DARK_SURFACE : LIGHT_SURFACE;
    const gridline = isDark ? DARK_GRIDLINE : LIGHT_GRIDLINE;
    const ink = isDark ? DARK_INK : LIGHT_INK;

    if (events.length === 0) {
      ctx.fillStyle = surface;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const minMidi = Math.min(...events.map((e) => e.midiNote)) - NOTE_PADDING;
    const maxMidi = Math.max(...events.map((e) => e.midiNote)) + NOTE_PADDING;
    const maxTime = Math.max(...events.map((e) => e.time + e.durationSeconds));

    const plotHeight = (maxMidi - minMidi + 1) * ROW_HEIGHT;
    const width = NOTE_LABEL_GUTTER + Math.max(400, maxTime * PIXELS_PER_SECOND);
    const height = plotHeight + TIME_AXIS_HEIGHT;
    canvas.width = width;
    canvas.height = height;

    const midiToY = (midi: number) => (maxMidi - midi) * ROW_HEIGHT;

    ctx.fillStyle = surface;
    ctx.fillRect(0, 0, width, height);

    // Octave gridlines (every C) with note-name labels in the left gutter.
    ctx.strokeStyle = gridline;
    ctx.fillStyle = ink;
    ctx.font = "10px system-ui, -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    for (let midi = minMidi; midi <= maxMidi; midi++) {
      if (midi % 12 === 0) {
        const y = midiToY(midi);
        ctx.beginPath();
        ctx.moveTo(NOTE_LABEL_GUTTER, y);
        ctx.lineTo(width, y);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillText(midiToNoteName(midi), 4, y + ROW_HEIGHT / 2);
      }
    }

    // Time axis ticks every 10s.
    ctx.strokeStyle = gridline;
    for (let t = 0; t <= maxTime; t += 10) {
      const x = NOTE_LABEL_GUTTER + t * PIXELS_PER_SECOND;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, plotHeight);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillText(`${t}s`, x + 2, plotHeight + TIME_AXIS_HEIGHT / 2);
    }

    // Note bars: 4px rounded ends per the dataviz skill's bar spec.
    for (const event of events) {
      const x = NOTE_LABEL_GUTTER + event.time * PIXELS_PER_SECOND;
      const barWidth = Math.max(2, event.durationSeconds * PIXELS_PER_SECOND - 1);
      const y = midiToY(event.midiNote) + 0.5;
      const barHeight = ROW_HEIGHT - 1;

      ctx.fillStyle = confidenceToColor(event.confidence, isDark);
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, y, barWidth, barHeight, Math.min(2, barHeight / 2));
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }
  }, [events, isDark]);

  if (events.length === 0) {
    return <p className="text-sm text-zinc-400">{t.empty}</p>;
  }

  return (
    <div className="overflow-x-auto border-y border-zinc-100 dark:border-zinc-900">
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
