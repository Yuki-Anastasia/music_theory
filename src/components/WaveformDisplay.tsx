"use client";

import { useEffect, useRef } from "react";

interface WaveformDisplayProps {
  analyserRef: React.RefObject<AnalyserNode | null>;
  isActive: boolean;
}

const WIDTH = 640;
const HEIGHT = 160;

/**
 * Oscilloscope-style time-domain waveform, redrawn every frame from the
 * mic's AnalyserNode. Silence reads as a flat line; any sound visibly wiggles
 * the trace — the most literal answer to "is the mic picking anything up".
 */
export default function WaveformDisplay({ analyserRef, isActive }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Float32Array<ArrayBuffer> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const clear = () => {
      ctx.fillStyle = "rgb(10,10,20)";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    };
    clear();

    if (!isActive) return;

    const draw = () => {
      const analyser = analyserRef.current;
      if (analyser) {
        const size = analyser.fftSize;
        if (!dataRef.current || dataRef.current.length !== size) {
          dataRef.current = new Float32Array(new ArrayBuffer(size * 4));
        }
        const data = dataRef.current;
        analyser.getFloatTimeDomainData(data);

        clear();
        ctx.strokeStyle = "rgb(80,220,140)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < WIDTH; x++) {
          const sampleIndex = Math.floor((x / WIDTH) * size);
          const y = (0.5 - data[sampleIndex] / 2) * HEIGHT;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // center line for reference
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, HEIGHT / 2);
        ctx.lineTo(WIDTH, HEIGHT / 2);
        ctx.stroke();
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [isActive, analyserRef]);

  return (
    <div className="rounded-lg border-2 border-zinc-300 p-2 dark:border-zinc-700">
      <div className="mb-1 text-xs text-zinc-500">波形(オシロスコープ)</div>
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="w-full rounded" />
    </div>
  );
}
