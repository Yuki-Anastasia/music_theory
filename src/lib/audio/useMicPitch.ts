"use client";

import { useCallback, useRef, useState } from "react";
import { PitchDetector, PitchReading, DEFAULT_BUFFER_SIZE } from "./pitchDetector";

export type MicPitchStatus = "idle" | "requesting" | "listening" | "denied" | "error";

interface LatencyStats {
  lastProcessingMs: number;
  avgProcessingMs: number;
  bufferLatencyMs: number; // fixed: bufferSize / sampleRate
}

export function useMicPitch() {
  const [status, setStatus] = useState<MicPitchStatus>("idle");
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [latency, setLatency] = useState<LatencyStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const detectorRef = useRef<PitchDetector | null>(null);
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
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = DEFAULT_BUFFER_SIZE;
      source.connect(analyser);
      analyserRef.current = analyser;

      detectorRef.current = new PitchDetector(audioContext.sampleRate);
      const bufferLatencyMs = (DEFAULT_BUFFER_SIZE / audioContext.sampleRate) * 1000;

      const buffer = new Float32Array(analyser.fftSize);
      const loop = () => {
        const analyserNode = analyserRef.current;
        const detector = detectorRef.current;
        if (!analyserNode || !detector) return;

        analyserNode.getFloatTimeDomainData(buffer);
        const result = detector.process(buffer);

        if (result) {
          setReading(result);
          const history = processingHistoryRef.current;
          history.push(result.processingMs);
          if (history.length > 30) history.shift();
          const avg = history.reduce((a, b) => a + b, 0) / history.length;
          setLatency({ lastProcessingMs: result.processingMs, avgProcessingMs: avg, bufferLatencyMs });
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

  return { status, reading, latency, errorMessage, start, stop };
}
