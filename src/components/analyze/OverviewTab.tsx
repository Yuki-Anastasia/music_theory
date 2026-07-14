"use client";

import PianoRollViewer from "@/components/PianoRollViewer";
import SectionHeader from "@/components/analyze/SectionHeader";
import type { NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import type { VoiceSeparation } from "@/lib/theory/voiceSeparation";
import type { PitchClassShare, ScaleFitEstimate } from "@/lib/theory/pitchClassProfile";
import { PITCH_CLASS_NAMES, midiToNoteName } from "@/lib/audio/pitch";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { overviewTabDict } from "@/lib/i18n/dict/overviewTab";

const HISTOGRAM_BAR_MAX_HEIGHT_PX = 128;

export interface OverviewTabData {
  label: string | null;
  events: NormalizedNoteEvent[];
  maxTime: number;
  histogram: number[];
  histogramMax: number;
  /** Note counts per notated part (score imports only); empty for audio-transcribed songs. */
  partComposition: [string, number][];
  /** Skyline-algorithm melody/bass/accompaniment split; null until events exist. */
  voices: VoiceSeparation | null;
  /** Duration-weighted pitch-class usage, ranked by share; empty until events exist. */
  pitchClassDistribution: PitchClassShare[];
  /** Best-fitting named scale for the pitch-class content, if any; null until events exist. */
  scaleFit: ScaleFitEstimate | null;
}

export default function OverviewTab({ data }: { data: OverviewTabData }) {
  const { label, events, maxTime, histogram, histogramMax, partComposition, voices, pitchClassDistribution, scaleFit } = data;
  const t = useDict(overviewTabDict);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeader {...t.pianoRoll} />
        <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
          <span>{label}</span>
          <span>{t.noteCount(events.length)}</span>
          <span>{t.seconds(maxTime.toFixed(1))}</span>
          {partComposition.length > 0 && (
            <span>
              {t.partComposition(partComposition.map(([name, count]) => t.partNote(name, count)).join(t.partSeparator))}
            </span>
          )}
        </div>
        <PianoRollViewer events={events} />
      </div>

      {voices && (
        <div>
          <SectionHeader {...t.voiceSeparation} />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
            <span>{t.melodyCount(voices.melody.length)}</span>
            <span>{t.bassCount(voices.bass.length)}</span>
            <span>{t.accompanimentCount(voices.accompaniment.length)}</span>
          </div>
          <p className="mt-3 break-words border-l-2 border-zinc-200 pl-4 font-mono text-xs leading-loose tracking-wide text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            {voices.melody
              .slice(0, 60)
              .map((e) => midiToNoteName(e.midiNote))
              .join("  ")}
            {voices.melody.length > 60 && "  …"}
          </p>
        </div>
      )}

      <div>
        <SectionHeader {...t.histogram} />
        <div className="flex items-end gap-1">
          {histogram.map((value, pitchClass) => (
            <div key={pitchClass} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-[#2a78d6] dark:bg-[#3987e5]"
                style={{ height: `${Math.max(2, (value / histogramMax) * HISTOGRAM_BAR_MAX_HEIGHT_PX)}px` }}
              />
              <span className="text-xs text-zinc-500">{PITCH_CLASS_NAMES[pitchClass]}</span>
            </div>
          ))}
        </div>
        {pitchClassDistribution.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            {pitchClassDistribution.slice(0, 6).map((p) => (
              <span key={p.pitchClass}>
                {PITCH_CLASS_NAMES[p.pitchClass]} {(p.share * 100).toFixed(1)}%
              </span>
            ))}
          </div>
        )}
        {scaleFit && scaleFit.confidence === "high" && (
          <p className="mt-2 text-xs text-zinc-500">
            {t.scaleMatch(PITCH_CLASS_NAMES[scaleFit.root], t.scaleNames[scaleFit.scaleName], (scaleFit.coverage * 100).toFixed(0))}
          </p>
        )}
      </div>
    </div>
  );
}
