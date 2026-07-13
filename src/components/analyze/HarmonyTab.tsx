"use client";

import TonnetzView from "@/components/TonnetzView";
import MetricCard from "@/components/analyze/MetricCard";
import SectionHeader from "@/components/analyze/SectionHeader";
import type { TonnetzTimelinePoint } from "@/lib/theory/tonnetzTimeline";
import type { AestheticMetrics, ConsonanceEstimate, PredictabilityEstimate } from "@/lib/theory/aestheticMetrics";
import type { CounterpointAnalysis, MotionType } from "@/lib/theory/counterpoint";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { harmonyTabDict } from "@/lib/i18n/dict/harmonyTab";

export interface HarmonyTabData {
  tonnetzTrajectory: TonnetzTimelinePoint[];
  aestheticMetrics: AestheticMetrics | null;
  markovSequence: number[] | null;
  markovMetrics: { consonance: ConsonanceEstimate; predictability: PredictabilityEstimate } | null;
  onGenerateMarkov: () => void;
  /** Chord names as notated in a MusicXML score import (null for audio-transcribed songs). */
  notatedChordText: string | null;
  /** Voice-leading motion between notated parts — score imports with 2+ parts only. */
  counterpoint: CounterpointAnalysis | null;
}

export default function HarmonyTab({ data }: { data: HarmonyTabData }) {
  const {
    tonnetzTrajectory,
    aestheticMetrics,
    markovSequence,
    markovMetrics,
    onGenerateMarkov,
    notatedChordText,
    counterpoint,
  } = data;
  const t = useDict(harmonyTabDict);
  const motionTypes = Object.keys(t.counterpoint.motion) as MotionType[];

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeader {...t.tonnetz} />
        <TonnetzView trajectory={tonnetzTrajectory} />
        {notatedChordText && (
          <p className="mt-2 break-words text-xs text-zinc-500">{t.notatedChord(notatedChordText)}</p>
        )}
      </div>

      {aestheticMetrics && (
        <div>
          <SectionHeader label={t.metrics.label} heading={t.metrics.heading} description={t.metrics.description} />
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
            <MetricCard
              title={t.metrics.consonance.title}
              theory={t.metrics.consonance.theory}
              formula="Γ(n) = 1 + Σ aᵢ(pᵢ - 1)"
              value={t.metrics.consonance.value(aestheticMetrics.consonance.averageGradus.toFixed(2))}
              note={t.metrics.consonance.note}
            />
            <MetricCard
              title={t.metrics.tension.title}
              theory={t.metrics.tension.theory}
              formula="min Σᵢ dist(aᵢ, b_perm(i))"
              value={t.metrics.tension.value(
                aestheticMetrics.harmonicTension.averageVoiceLeadingDistance.toFixed(2),
                aestheticMetrics.harmonicTension.maxVoiceLeadingDistance.toFixed(2)
              )}
              note={t.metrics.tension.note}
            />
            <MetricCard
              title={t.metrics.predictability.title}
              theory={t.metrics.predictability.theory}
              formula="H(Xₙ₊₁|Xₙ) = -Σ p(a,b)log₂p(b|a)"
              value={t.metrics.predictability.value(
                aestheticMetrics.predictability.conditionalEntropyBits.toFixed(2),
                aestheticMetrics.predictability.maxEntropyBits.toFixed(2)
              )}
              note={t.metrics.predictability.note}
            />
            <MetricCard
              title={t.metrics.selfSimilarity.title}
              theory={t.metrics.selfSimilarity.theory}
              formula="r(τ) = Σ(x[n]-μ)(x[n+τ]-μ) / Σ(x[n]-μ)²"
              value={t.metrics.selfSimilarity.value(
                aestheticMetrics.selfSimilarity.bestLagNotes,
                aestheticMetrics.selfSimilarity.correlation.toFixed(2)
              )}
              note={t.metrics.selfSimilarity.note}
            />
          </div>
        </div>
      )}

      {counterpoint && counterpoint.pairs.length > 0 && (
        <div>
          <SectionHeader
            label={t.counterpoint.label}
            heading={t.counterpoint.heading}
            description={t.counterpoint.description(
              counterpoint.totalPartsFound > counterpoint.partsAnalyzed.length
                ? t.counterpoint.descriptionExtra(counterpoint.totalPartsFound, counterpoint.partsAnalyzed.length)
                : ""
            )}
          />
          <div className="overflow-x-auto border-y border-zinc-100 dark:border-zinc-900">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                  <th className="p-3 font-normal">{t.counterpoint.partColumn}</th>
                  {motionTypes.map((type) => (
                    <th key={type} className="p-3 font-normal">
                      {t.counterpoint.motion[type]}
                    </th>
                  ))}
                  <th className="p-3 font-normal">{t.counterpoint.parallelColumn}</th>
                </tr>
              </thead>
              <tbody>
                {counterpoint.pairs.map((pair) => (
                  <tr
                    key={`${pair.partA}-${pair.partB}`}
                    className="border-b border-zinc-200 last:border-0 dark:border-zinc-800"
                  >
                    <td className="p-3 text-zinc-500">
                      {pair.partA} - {pair.partB}
                    </td>
                    {motionTypes.map((type) => (
                      <td key={type} className="p-3">
                        {pair.motionPercentages[type].toFixed(0)}%
                      </td>
                    ))}
                    <td className="p-3">
                      {pair.parallelFifthsCount}/{pair.parallelOctavesCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <SectionHeader {...t.generative} />
        <button
          onClick={onGenerateMarkov}
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
        >
          {t.generative.generate}
        </button>

        {markovSequence && (
          <div className="mt-4 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
            <p className="break-words font-mono text-xs leading-loose tracking-wide">
              {markovSequence.map((pc) => PITCH_CLASS_NAMES[pc]).join("  ")}
            </p>
            {markovMetrics && aestheticMetrics && (
              <table className="mt-3 text-xs">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="pb-1 pr-4 font-normal"></th>
                    <th className="pb-1 pr-4 font-normal">{t.generative.originalColumn}</th>
                    <th className="pb-1 font-normal">{t.generative.generatedColumn}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="pr-4 text-zinc-500">{t.generative.consonanceRow}</td>
                    <td className="pr-4">{aestheticMetrics.consonance.averageGradus.toFixed(2)}</td>
                    <td>{markovMetrics.consonance.averageGradus.toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td className="pr-4 text-zinc-500">{t.generative.predictabilityRow}</td>
                    <td className="pr-4">{aestheticMetrics.predictability.conditionalEntropyBits.toFixed(2)}</td>
                    <td>{markovMetrics.predictability.conditionalEntropyBits.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
