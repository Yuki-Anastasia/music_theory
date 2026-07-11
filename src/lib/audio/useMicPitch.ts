"use client";

import { useCallback, useRef, useState } from "react";
import { PitchDetector, PitchReading, minReliableFrequency } from "./pitchDetector";

export type MicPitchStatus = "idle" | "requesting" | "listening" | "denied" | "error";
export type PitchResolution = "fast" | "slow";

// Dual-resolution detection: a small/fast window gives low latency for
// normal-to-high notes, a large/slow window catches low notes the fast
// window structurally can't resolve. Both run every frame; we prefer the
// fast result whenever it's above its own reliable floor (with margin),
// and fall back to the slow result otherwise. This avoids the tradeoff of
// picking one fixed buffer size for everything.
const FAST_BUFFER_SIZE = 2048; // ~46ms buffer latency, reliable floor ~86Hz
const SLOW_BUFFER_SIZE = 4096; // ~93ms buffer latency, reliable floor ~43Hz
const FAST_TRUST_MARGIN = 1.1; // require 10% headroom above the fast floor before trusting it

export interface MicPitchReading extends PitchReading {
  resolution: PitchResolution;
}

interface LatencyStats {
  lastProcessingMs: number;
  avgProcessingMs: number;
  bufferLatencyMs: number; // depends on which resolution produced the current reading
  resolution: PitchResolution;
}

export function useMicPitch() {
  const [status, setStatus] = useState<MicPitchStatus>("idle");
  const [reading, setReading] = useState<MicPitchReading | null>(null);
  const [latency, setLatency] = useState<LatencyStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fastAnalyserRef = useRef<AnalyserNode | null>(null);
  const slowAnalyserRef = useRef<AnalyserNode | null>(null);
  const fastDetectorRef = useRef<PitchDetector | null>(null);
  const slowDetectorRef = useRef<PitchDetector | null>(null);
  const rafRef = useRef<number | null>(null);
  const processingHistoryRef = useRef<number[]>([]);

  const stop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    setStatus("idle");
    setReading(null);
  }, []);

  const start = useCallback(async () => {
    setStatus("requesting");
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextCtor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioContext = new AudioContextCtor();
      audioContextRef.current = audioContext;
      await audioContext.resume(); // must happen inside the user-gesture-triggered call

      const source = audioContext.createMediaStreamSource(stream);

      const fastAnalyser = audioContext.createAnalyser();
      fastAnalyser.fftSize = FAST_BUFFER_SIZE;
      const slowAnalyser = audioContext.createAnalyser();
      slowAnalyser.fftSize = SLOW_BUFFER_SIZE;
      source.connect(fastAnalyser);
      source.connect(slowAnalyser);
      fastAnalyserRef.current = fastAnalyser;
      slowAnalyserRef.current = slowAnalyser;

      const sampleRate = audioContext.sampleRate;
      fastDetectorRef.current = new PitchDetector(sampleRate);
      slowDetectorRef.current = new PitchDetector(sampleRate);

      const fastBufferLatencyMs = (FAST_BUFFER_SIZE / sampleRate) * 1000;
      const slowBufferLatencyMs = (SLOW_BUFFER_SIZE / sampleRate) * 1000;
      const fastTrustFloor = minReliableFrequency(sampleRate, FAST_BUFFER_SIZE) * FAST_TRUST_MARGIN;

      const fastBuffer = new Float32Array(FAST_BUFFER_SIZE);
      const slowBuffer = new Float32Array(SLOW_BUFFER_SIZE);

      const loop = () => {
        const fastNode = fastAnalyserRef.current;
        const slowNode = slowAnalyserRef.current;
        const fastDetector = fastDetectorRef.current;
        const slowDetector = slowDetectorRef.current;
        if (!fastNode || !slowNode || !fastDetector || !slowDetector) return;

        fastNode.getFloatTimeDomainData(fastBuffer);
        const fastResult = fastDetector.process(fastBuffer);

        let chosen: MicPitchReading | null = null;
        let bufferLatencyMs = fastBufferLatencyMs;

        if (fastResult && fastResult.frequency >= fastTrustFloor) {
          chosen = { ...fastResult, resolution: "fast" };
          bufferLatencyMs = fastBufferLatencyMs;
        } else {
          slowNode.getFloatTimeDomainData(slowBuffer);
          const slowResult = slowDetector.process(slowBuffer);
          if (slowResult) {
            chosen = { ...slowResult, resolution: "slow" };
            bufferLatencyMs = slowBufferLatencyMs;
          }
        }

        if (chosen) {
          setReading(chosen);
          const history = processingHistoryRef.current;
          history.push(chosen.processingMs);
          if (history.length > 30) history.shift();
          const avg = history.reduce((a, b) => a + b, 0) / history.length;
          setLatency({
            lastProcessingMs: chosen.processingMs,
            avgProcessingMs: avg,
            bufferLatencyMs,
            resolution: chosen.resolution,
          });
        } else {
          setReading(null);
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      setStatus("listening");
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setStatus("denied");
      } else {
        setStatus("error");
      }
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Exposed so a visualization component can pull frequency-domain data on
  // its own rAF loop, independent of the pitch-detection state updates.
  return { status, reading, latency, errorMessage, start, stop, analyserRef: fastAnalyserRef };
}
