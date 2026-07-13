"use client";

import { useEffect, useRef } from "react";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { chartsDict } from "@/lib/i18n/dict/charts";

interface SignalSpectrogramProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isActive: boolean;
  hasSignal: boolean;
}

// Covers our detection range (0-4200Hz) with a little headroom.
const MAX_DISPLAY_FREQ = 5000;
const WIDTH = 640;
const HEIGHT = 200;

/** Black -> blue -> green -> yellow -> red heat colormap for a 0-255 amplitude. */
function amplitudeToColor(value: number): string {
  const t = value / 255;
  const stops: [number, number, number, number][] = [
    [0, 10, 10, 30],
    [0.25, 30, 60, 180],
    [0.5, 30, 180, 90],
    [0.75, 230, 210, 40],
    [1, 230, 50, 30],
  ];
  for (let i = 1; i < stops.length; i++) {
    const [t0, r0, g0, b0] = stops[i - 1];
    const [t1, r1, g1, b1] = stops[i];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return `rgb(${Math.round(r0 + (r1 - r0) * f)},${Math.round(g0 + (g1 - g0) * f)},${Math.round(b0 + (b1 - b0) * f)})`;
    }
  }
  return "rgb(230,50,30)";
}

/**
 * Live scrolling spectrogram (time on X, frequency on Y, amplitude as
 * color) drawn straight from the mic's AnalyserNode. Debug/visual-feedback
 * tool for the Day-1 PoC: makes it obvious at a glance whether the mic is
 * actually picking up sound, independent of whether YIN found a clean pitch.
 */
export default function SignalSpectrogram({ analyserRef, isActive, hasSignal }: SignalSpectrogramProps) {
  const t = useDict(chartsDict).spectrogram;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "rgb(10,10,20)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    if (!isActive) return;

    const draw = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        const bins = analyser.frequencyBinCount;
        if (!dataRef.current || dataRef.current.length !== bins) {
          dataRef.current = new Uint8Array(new ArrayBuffer(bins));
        }
        const data = dataRef.current;
        analyser.getByteFrequencyData(data);
        const nyquist = analyser.context.sampleRate / 2;

        // Scroll everything 1px left, then paint a fresh column at the right edge.
        ctx.drawImage(canvas, 1, 0, WIDTH - 1, HEIGHT, 0, 0, WIDTH - 1, HEIGHT);

        for (let y = 0; y < HEIGHT; y++) {
          const freq = (1 - y / HEIGHT) * MAX_DISPLAY_FREQ; // low freq at bottom, high at top
          const binIndex = Math.min(bins - 1, Math.max(0, Math.floor((freq / nyquist) * bins)));
          ctx.fillStyle = amplitudeToColor(data[binIndex]);
          ctx.fillRect(WIDTH - 1, y, 1, 1);
        }
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, analyserRef]);

  return (
    <div
      className={`border-y py-2 transition-colors ${
        hasSignal ? "border-[#2a78d6] dark:border-[#3987e5]" : "border-zinc-100 dark:border-zinc-900"
      }`}
    >
      <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
        <span>{t.label(MAX_DISPLAY_FREQ / 1000)}</span>
        <span className={hasSignal ? "font-medium text-[#2a78d6] dark:text-[#3987e5]" : "text-zinc-400"}>
          {hasSignal ? t.detecting : t.silent}
        </span>
      </div>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="w-full rounded" />
    </div>
  );
}
