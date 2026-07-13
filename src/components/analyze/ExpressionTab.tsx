"use client";

import MetricCard from "@/components/analyze/MetricCard";
import SectionHeader from "@/components/analyze/SectionHeader";
import MoodQuadrantChart from "@/components/MoodQuadrantChart";
import { describeMoodQuadrant } from "@/lib/theory/emotionEstimate";
import type { TempoEstimate, RhythmicEntropyEstimate } from "@/lib/theory/rhythmAnalysis";
import type { DynamicsSummary } from "@/lib/theory/dynamicsAnalysis";
import type { ArcSection } from "@/lib/theory/songArc";
import type { MeterAnalysisResult } from "@/lib/theory/meterAnalysis";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { expressionTabDict } from "@/lib/i18n/dict/expressionTab";

export interface ExpressionTabData {
  tempo: TempoEstimate | null;
  rhythmEntropy: RhythmicEntropyEstimate | null;
  dynamics: DynamicsSummary | null;
  valence: number | null;
  arousal: number | null;
  arc: ArcSection[];
  /** Meter/syncopation analysis — score imports only (null for audio-transcribed songs, which have no bar data). */
  meter: MeterAnalysisResult | null;
  /** How many percussion-track onsets fed into the syncopation figure above — drums carry no pitch, so they never appear as a selectable part, but their timing still informs the beat. 0 when the score has no percussion track or the input is audio-transcribed. */
  percussionOnsetCount: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Presents four stages of the same narrative — rhythm, dynamics, mood
 * estimate, then how those measurements evolve across the song — rather
 * than as unrelated dashboard statistics.
 */
export default function ExpressionTab({ data }: { data: ExpressionTabData }) {
  const { tempo, rhythmEntropy, dynamics, valence, arousal, arc, meter, percussionOnsetCount } = data;
  const { locale } = useLocale();
  const t = useDict(expressionTabDict);
  const dynamicsTrendLabel = { crescendo: t.dynamics.crescendo, diminuendo: t.dynamics.diminuendo, stable: t.dynamics.stable };

  return (
    <div className="flex flex-col gap-10">
      {tempo && rhythmEntropy && (
        <div>
          <SectionHeader {...t.rhythm} />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <MetricCard
              title={t.rhythm.tempo.title}
              theory={tempo.source === "notated" ? t.rhythm.tempo.theoryNotated : t.rhythm.tempo.theory}
              formula="argmax_τ r(τ)、bpm = 60 / τ"
              value={t.rhythm.tempo.value(tempo.bpm)}
              note={
                tempo.source === "notated"
                  ? t.rhythm.tempo.noteNotated
                  : tempo.confidence === "low"
                    ? t.rhythm.tempo.noteLow
                    : t.rhythm.tempo.noteOk
              }
            />
            <MetricCard
              title={t.rhythm.complexity.title}
              theory={t.rhythm.complexity.theory}
              formula="H = -Σ p(bucket) log₂ p(bucket)"
              value={t.rhythm.complexity.value(rhythmEntropy.entropyBits.toFixed(2), rhythmEntropy.maxEntropyBits.toFixed(2))}
              note={t.rhythm.complexity.note}
            />
          </div>
        </div>
      )}

      {meter && (
        <div>
          <SectionHeader {...t.meter} />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <MetricCard
              title={t.meter.meterCard.title}
              theory={t.meter.meterCard.theory}
              formula="numerator / denominator"
              value={meter.meterSummary.map((p) => `${formatTime(p.time)}〜 ${p.numerator}/${p.denominator}`).join(", ")}
              note={t.meter.meterCard.note}
            />
            <MetricCard
              title={t.meter.syncopation.title}
              theory={t.meter.syncopation.theory}
              formula="Σ max(0, strongerWeight-ownWeight) / (pairCount×weightRange)"
              value={t.meter.syncopation.value(meter.syncopation.normalizedScore.toFixed(2))}
              note={
                percussionOnsetCount > 0
                  ? t.meter.syncopation.noteWithPercussion(percussionOnsetCount)
                  : t.meter.syncopation.noteBase
              }
            />
            {meter.harmonicRhythmAlignment && (
              <MetricCard
                title={t.meter.alignment.title}
                theory={
                  meter.harmonicRhythmAlignment.source === "notatedChords"
                    ? t.meter.alignment.theoryNotated
                    : t.meter.alignment.theoryDetected
                }
                formula="strongBeatCount / totalChordChanges"
                value={t.meter.alignment.value((meter.harmonicRhythmAlignment.strongBeatFraction * 100).toFixed(0))}
                note={t.meter.alignment.note}
              />
            )}
          </div>
        </div>
      )}

      {dynamics && (
        <div>
          <SectionHeader label={t.dynamics.label} heading={t.dynamics.heading} description={t.dynamics.description} />
          <MetricCard
            title={t.dynamics.title}
            theory={t.dynamics.theory}
            formula="range = max(区間平均) - min(区間平均)"
            value={t.dynamics.value(dynamics.averageLoudness.toFixed(2), dynamics.dynamicRange.toFixed(2))}
            note={dynamicsTrendLabel[dynamics.trend]}
          />
        </div>
      )}

      {valence !== null && arousal !== null && (
        <div>
          <SectionHeader {...t.mood} />
          <MoodQuadrantChart valence={valence} arousal={arousal} />
        </div>
      )}

      {arc.length > 0 && (
        <div>
          <SectionHeader {...t.arc} />
          <div className="overflow-x-auto border-y border-zinc-100 dark:border-zinc-900">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="p-3 font-normal"></th>
                  {arc.map((s) => (
                    <th key={s.startSec} className="p-3 font-normal">
                      {formatTime(s.startSec)}-{formatTime(s.endSec)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="p-3 text-zinc-500">{t.arc.consonanceRow}</td>
                  {arc.map((s) => (
                    <td key={s.startSec} className="p-3">
                      {s.consonance.averageGradus.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-zinc-200 dark:border-zinc-800">
                  <td className="p-3 text-zinc-500">{t.arc.dynamicsRow}</td>
                  {arc.map((s) => (
                    <td key={s.startSec} className="p-3">
                      {s.dynamics.averageLoudness.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="p-3 text-zinc-500">{t.arc.moodRow}</td>
                  {arc.map((s) => (
                    <td key={s.startSec} className="p-3">
                      {describeMoodQuadrant(s.valence, s.arousal, locale)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
