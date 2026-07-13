"use client";

import { useMicPitch } from "@/lib/audio/useMicPitch";
import MicInput from "@/components/MicInput";
import SignalSpectrogram from "@/components/SignalSpectrogram";
import WaveformDisplay from "@/components/WaveformDisplay";
import WaveformFragment from "@/components/decoration/WaveformFragment";
import { midiToNoteName } from "@/lib/audio/pitch";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { liveDict } from "@/lib/i18n/dict/live";

/**
 * Real-time mic input: pitch/note detection running entirely in the
 * browser (YIN algorithm), with a dual-resolution detector (a fast window
 * for normal-to-high notes, a slower window for low notes) so both ranges
 * stay responsive.
 */
export default function LivePage() {
  const { status, reading, latency, errorMessage, start, stop, analyserRef } = useMicPitch();
  const t = useDict(liveDict);

  const totalLatencyMs = latency != null ? latency.bufferLatencyMs + latency.avgProcessingMs : null;
  const isActive = status === "listening" && !!reading;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-8 p-8">
      <div>
        <p className="text-xs font-medium tracking-[0.15em] text-navy">{t.label}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t.heading}</h1>
        <p className="mt-2 text-sm text-zinc-500">{t.description}</p>
      </div>

      <MicInput status={status} errorMessage={errorMessage} onStart={start} onStop={stop} labels={t.mic} />

      {/* Primary: the detected note — the dominant element, tuner-like */}
      <div className="relative flex flex-col items-center gap-1 overflow-hidden py-8 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-navy opacity-[0.08]"
        >
          <WaveformFragment className="h-24 w-full" />
        </div>

        <div
          className={`relative font-mono text-7xl font-semibold tabular-nums transition-colors ${
            isActive ? "text-[#2a78d6] dark:text-[#3987e5]" : "text-zinc-300 dark:text-zinc-700"
          }`}
        >
          {reading ? midiToNoteName(reading.midiNote) : t.placeholder}
        </div>
        <div className={`relative font-mono text-lg ${isActive ? "text-zinc-700 dark:text-zinc-300" : "text-zinc-400"}`}>
          {reading ? `${reading.frequency.toFixed(1)} Hz` : `${t.placeholder} Hz`}
        </div>
        {reading && (
          <div className="relative font-mono text-xs text-zinc-400">
            {reading.centsOff > 0 ? "+" : ""}
            {reading.centsOff.toFixed(1)}¢ / {t.pitchClassPrefix} {reading.pitchClass}
          </div>
        )}
      </div>

      {/* Secondary: confidence, resolution, latency — visible but de-emphasized */}
      <div className="flex flex-col gap-1 border-t border-zinc-200 pt-4 text-xs text-zinc-400 dark:border-zinc-800">
        <div className="flex flex-wrap gap-x-6">
          <span>
            {t.confidence}: {reading ? `${(reading.confidence * 100).toFixed(0)}%` : t.placeholder}
          </span>
          <span>
            {t.resolution}: {reading ? (reading.resolution === "fast" ? t.resolutionFast : t.resolutionLow) : t.placeholder}
          </span>
        </div>
        {latency && (
          <div className="flex flex-wrap gap-x-6">
            <span>
              {t.bufferLatency}: {latency.bufferLatencyMs.toFixed(1)} ms
            </span>
            <span>
              {t.processingTime}: {latency.avgProcessingMs.toFixed(2)} ms
            </span>
            <span>
              {t.totalLatency}: {totalLatencyMs?.toFixed(1)} ms
              {totalLatencyMs != null && totalLatencyMs >= 100 && <span className="text-red-500">{t.overTarget}</span>}
            </span>
          </div>
        )}
      </div>

      {/* Waveform / spectrogram */}
      <div className="flex flex-col gap-4">
        <WaveformDisplay analyserRef={analyserRef} isActive={status === "listening"} />
        <SignalSpectrogram analyserRef={analyserRef} isActive={status === "listening"} hasSignal={!!reading} />
      </div>

      <p className="text-xs text-zinc-400">{t.privacyNote}</p>
    </main>
  );
}
