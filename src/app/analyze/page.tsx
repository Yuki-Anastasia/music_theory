"use client";

import { useState } from "react";
import SongUploader from "@/components/SongUploader";
import ScoreUploader from "@/components/ScoreUploader";
import WaveformFragment from "@/components/decoration/WaveformFragment";
import StaffFragment from "@/components/decoration/StaffFragment";
import TonnetzFragment from "@/components/decoration/TonnetzFragment";
import type { ScoreAnalysis, NotatedKeyPoint, NotatedChordPoint, MeterPoint } from "@/lib/score/musicXml";
import type { ScoreConsistencyWarning } from "@/lib/score/scoreConsistency";
import { collapseKeySegments } from "@/lib/theory/keyProfile";
import { melodicRange } from "@/lib/theory/melodicRange";
import { estimateClimax } from "@/lib/theory/songArc";
import { detectModulations } from "@/lib/theory/modulation";
import { analyzeChordFunctions } from "@/lib/theory/chordFunction";
import { findStrongestRecurrence } from "@/lib/theory/songForm";
import OverviewTab from "@/components/analyze/OverviewTab";
import TonalityTab from "@/components/analyze/TonalityTab";
import HarmonyTab from "@/components/analyze/HarmonyTab";
import ExpressionTab from "@/components/analyze/ExpressionTab";
import AIExplanationTab, { AIExplanationMessage, FollowUpStatus, SummaryStatus } from "@/components/analyze/AIExplanationTab";
import { aiExplanationTabDict } from "@/lib/i18n/dict/aiExplanationTab";
import PartSelector from "@/components/analyze/PartSelector";
import { analyzeSong } from "@/lib/audio/songAnalyzer";
import { notesToNormalizedEvents, pitchClassHistogram, NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import { estimateKeyTimeline } from "@/lib/theory/keyTimeline";
import { estimateFourierTimeline } from "@/lib/theory/fourierTimeline";
import { estimateTonnetzTrajectory } from "@/lib/theory/tonnetzTimeline";
import {
  analyzeAesthetics,
  buildPitchClassTransitionMatrix,
  generateMarkovSequence,
  consonanceOfHistogram,
  conditionalPitchEntropy,
} from "@/lib/theory/aestheticMetrics";
import { estimateTempo, rhythmicEntropy, TempoEstimate } from "@/lib/theory/rhythmAnalysis";
import { dynamicsSummary } from "@/lib/theory/dynamicsAnalysis";
import { estimateValence, estimateArousal } from "@/lib/theory/emotionEstimate";
import { separateVoices } from "@/lib/theory/voiceSeparation";
import { estimateSongArc } from "@/lib/theory/songArc";
import { analyzeMeter } from "@/lib/theory/meterAnalysis";
import { analyzeCounterpoint } from "@/lib/theory/counterpoint";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { analyzeShellDict } from "@/lib/i18n/dict/analyzeShell";

type Status = "idle" | "analyzing" | "done" | "error";
type TabId = "overview" | "tonality" | "harmony" | "expression" | "ai";

const SOFT_TARGET_MS = 30_000;
const MARKOV_SEQUENCE_LENGTH = 32;
const MARKOV_NOTE_DURATION_SEC = 0.5;
// The lowest-sounding note strongly implies a chord's root (figured-bass
// convention), so it's weighted up before feeding chord detection.
const BASS_WEIGHT = 1.5;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Collapses consecutive identical notated keys into labeled time ranges, e.g. "0:00-1:20 ト長調". */
function formatNotatedKeySegments(timeline: NotatedKeyPoint[], durationSec: number): string {
  const segments = collapseKeySegments(timeline, durationSec, (p) => p, () => false);
  return segments.map((s) => `${formatTime(s.start)}-${formatTime(s.end)} ${s.label}`).join(", ");
}

const TAB_ORDER: TabId[] = ["overview", "tonality", "harmony", "expression", "ai"];

// One contextual decoration accent next to the tab bar, varying with the
// active tab's domain — a single motif, not one per section.
const TAB_ACCENTS: Partial<Record<TabId, typeof StaffFragment>> = {
  tonality: StaffFragment,
  harmony: TonnetzFragment,
  expression: WaveformFragment,
};

export default function AnalyzeSongPage() {
  const { locale } = useLocale();
  const t = useDict(analyzeShellDict);
  const aiT = useDict(aiExplanationTabDict);
  const [status, setStatus] = useState<Status>("idle");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [label, setLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  // Raw, unfiltered events from the last parse (audio transcription or
  // score import). The `events` used everywhere below is derived from this
  // plus selectedParts, so a part-selection change recomputes every
  // downstream analysis without touching any theory module.
  const [parsedEvents, setParsedEvents] = useState<NormalizedNoteEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [aiMessages, setAiMessages] = useState<AIExplanationMessage[]>([]);
  const [followUpStatus, setFollowUpStatus] = useState<FollowUpStatus>("idle");
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [markovSequence, setMarkovSequence] = useState<number[] | null>(null);
  const [notatedKeyTimeline, setNotatedKeyTimeline] = useState<NotatedKeyPoint[]>([]);
  const [notatedChordTimeline, setNotatedChordTimeline] = useState<NotatedChordPoint[]>([]);
  const [meterTimeline, setMeterTimeline] = useState<MeterPoint[]>([]);
  const [scorePartNames, setScorePartNames] = useState<string[]>([]);
  const [scoreWarnings, setScoreWarnings] = useState<ScoreConsistencyWarning[]>([]);
  // Onset times of unpitched percussion notes — never part of `events`/PartSelector (no pitch, not a selectable "part"), but fed into the meter/syncopation analysis as a beat indicator.
  const [percussionOnsets, setPercussionOnsets] = useState<number[]>([]);
  // The tempo as actually notated in the score (e.g. MusicXML <sound tempo>,
  // or Guitar Pro's always-present tempo field). null for audio-transcribed
  // input, or a score that never specifies one — in both cases tempo falls
  // back to autocorrelation estimation below.
  const [notatedTempoBpm, setNotatedTempoBpm] = useState<number | null>(null);
  // Which of scorePartNames are currently included in the analysis; empty/unused for audio-transcribed input (no partLabel there).
  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());

  const handleReady = async (input: Blob | AudioBuffer, sourceLabel: string) => {
    setStatus("analyzing");
    setLabel(sourceLabel);
    setProgress(0);
    setElapsedMs(0);
    setErrorMessage(null);
    setNotatedKeyTimeline([]);
    setNotatedChordTimeline([]);
    setMeterTimeline([]);
    setScorePartNames([]);
    setScoreWarnings([]);
    setSelectedParts(new Set());
    setPercussionOnsets([]);
    setNotatedTempoBpm(null);

    try {
      const notes = await analyzeSong(input, ({ fraction, elapsedMs: ms }) => {
        setProgress(fraction);
        setElapsedMs(ms);
      });
      setParsedEvents(notesToNormalizedEvents(notes));
      setStatus("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleScoreReady = (analysis: ScoreAnalysis, sourceLabel: string, warnings: ScoreConsistencyWarning[]) => {
    setStatus("done");
    setLabel(sourceLabel);
    setErrorMessage(null);
    setParsedEvents(analysis.events);
    setNotatedKeyTimeline(analysis.notatedKeyTimeline);
    setNotatedChordTimeline(analysis.notatedChordTimeline);
    setMeterTimeline(analysis.meterTimeline);
    setScorePartNames(analysis.partNames);
    setScoreWarnings(warnings);
    setSelectedParts(new Set(analysis.partNames)); // all parts included by default
    setPercussionOnsets(analysis.percussionOnsets);
    setNotatedTempoBpm(analysis.notatedTempoBpm);
  };

  const togglePart = (name: string) => {
    setSelectedParts((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleGenerateMarkov = () => {
    if (events.length === 0) return;
    const matrix = buildPitchClassTransitionMatrix(events);
    setMarkovSequence(generateMarkovSequence(matrix, events[0].pitchClass, MARKOV_SEQUENCE_LENGTH));
  };

  // Shared by both the initial generation and every follow-up question —
  // the underlying analysis facts never change within a session, only the
  // conversation (history/question) layered on top of them does.
  const analysisRequestBody = () => ({
    label,
    durationSec: maxTime,
    keyTimeline,
    fourierTimeline,
    tonnetzTrajectory,
    metrics: aestheticMetrics,
    mood,
    arc,
    meter: meterAnalysis,
    counterpoint: counterpointAnalysis,
    includedParts,
    notatedKeyTimeline,
    scoreWarnings,
    melodicRange: melodicRangeStats,
    climax,
    modulations,
    chordFunctions,
    songForm,
    locale,
  });

  const handleGenerateSummary = async () => {
    setSummaryStatus("loading");
    setSummaryError(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(analysisRequestBody()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t.summaryFailedFallback);
      setAiMessages([{ role: "assistant", text: data.summary }]);
      setSummaryStatus("done");
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err));
      setSummaryStatus("error");
    }
  };

  const handleAskFollowUp = async (question: string) => {
    const historySnapshot = aiMessages.map((m) => ({ role: m.role, content: m.text }));
    setAiMessages((prev) => [...prev, { role: "user", text: question }]);
    setFollowUpStatus("loading");
    setFollowUpError(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...analysisRequestBody(), history: historySnapshot, question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? aiT.followUpErrorFallback);
      setAiMessages((prev) => [...prev, { role: "assistant", text: data.summary }]);
      setFollowUpStatus("idle");
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : String(err));
      setFollowUpStatus("error");
    }
  };

  // Filters raw parsed events down to the currently-selected parts. Only
  // applies when scorePartNames is non-empty (score-import path); audio
  // transcription never sets partLabel, so this is a no-op passthrough
  // there. Every analysis below reads this filtered `events`, so toggling
  // a part in PartSelector recomputes the entire page.
  const events =
    scorePartNames.length > 0
      ? parsedEvents.filter((e) => !e.partLabel || selectedParts.has(e.partLabel))
      : parsedEvents;

  const maxTime =
    events.length > 0 || percussionOnsets.length > 0
      ? Math.max(0, ...events.map((e) => e.time + e.durationSeconds), ...percussionOnsets)
      : 0;
  const histogram = events.length > 0 ? pitchClassHistogram(events, 0, maxTime) : [];
  const histogramMax = Math.max(1, ...histogram);
  const keyTimeline = events.length > 0 ? estimateKeyTimeline(events) : [];
  const fourierTimeline = events.length > 0 ? estimateFourierTimeline(events) : [];
  const voices = events.length > 0 ? separateVoices(events) : null;
  // Chord detection uses harmony + bass only, excluding the melody line —
  // otherwise melodic non-chord tones (passing/neighbor tones) get counted
  // as if they were part of the underlying harmony. The bass is weighted up
  // since the lowest note strongly implies the chord's root.
  const harmonyEvents = voices
    ? [
        ...voices.accompaniment,
        ...voices.bass.map((e) => ({ ...e, confidence: Math.min(1, e.confidence * BASS_WEIGHT) })),
      ]
    : [];
  const tonnetzTrajectory = harmonyEvents.length > 0 ? estimateTonnetzTrajectory(harmonyEvents) : [];
  const aestheticMetrics = voices ? analyzeAesthetics(voices.melody, histogram, tonnetzTrajectory) : null;
  // A notated tempo (score import) is ground truth and always wins over
  // re-deriving it from onset autocorrelation, which can lock onto a
  // tempo/2 or tempo/3 subharmonic for a perfectly periodic signal.
  const tempo: TempoEstimate | null =
    notatedTempoBpm !== null
      ? { bpm: notatedTempoBpm, confidence: "high", source: "notated" }
      : events.length > 0
        ? estimateTempo(events)
        : null;
  const rhythmEntropy = events.length > 0 ? rhythmicEntropy(events) : null;
  const dynamics = events.length > 0 ? dynamicsSummary(events) : null;
  const valence =
    aestheticMetrics && tempo
      ? estimateValence(keyTimeline, aestheticMetrics.consonance.consonanceScore, aestheticMetrics.harmonicTension)
      : null;
  const arousal =
    tempo && dynamics && rhythmEntropy && aestheticMetrics
      ? estimateArousal(
          tempo.bpm,
          dynamics,
          rhythmEntropy.entropyBits,
          aestheticMetrics.harmonicTension,
          aestheticMetrics.selfSimilarity
        )
      : null;
  const mood =
    tempo && rhythmEntropy && dynamics && valence !== null && arousal !== null
      ? { tempo, rhythmEntropy, dynamics, valence, arousal }
      : null;
  const arc =
    mood && voices
      ? estimateSongArc(events, voices.melody, tonnetzTrajectory, keyTimeline, mood.tempo.bpm, maxTime)
      : [];
  const climax = arc.length > 0 ? estimateClimax(arc) : null;
  const modulations = keyTimeline.length > 0 ? detectModulations(keyTimeline, maxTime) : [];
  const chordFunctions =
    tonnetzTrajectory.length > 0 && keyTimeline.length > 0
      ? analyzeChordFunctions(tonnetzTrajectory, keyTimeline)
      : [];
  const melodicRangeStats = voices ? melodicRange(voices.melody) : null;
  const songForm = events.length > 0 ? findStrongestRecurrence(events, maxTime) : null;

  // Both are score-import-only: meterTimeline/scorePartNames stay empty for
  // audio-transcribed input (see handleReady above), so these naturally
  // resolve to null there.
  const meterAnalysis =
    meterTimeline.length > 0 && (events.length > 0 || percussionOnsets.length > 0)
      ? analyzeMeter(events, meterTimeline, maxTime, tonnetzTrajectory, notatedChordTimeline, percussionOnsets)
      : null;
  const counterpointAnalysis = scorePartNames.length >= 2 ? analyzeCounterpoint(events, scorePartNames) : null;

  // partLabel is only set for score-imported events (see ScoreUploader/musicXml.ts);
  // audio-transcribed events leave it undefined, so this is naturally empty for that path.
  const partComposition = Object.entries(
    events.reduce<Record<string, number>>((counts, e) => {
      if (e.partLabel) counts[e.partLabel] = (counts[e.partLabel] ?? 0) + 1;
      return counts;
    }, {})
  );
  // The subset of scorePartNames actually selected — passed to the AI
  // summary so it names which instrument(s) the analysis covers, in case
  // the user deselected some parts (see PartSelector).
  const includedParts = scorePartNames.filter((name) => selectedParts.has(name));

  const notatedKeyText = notatedKeyTimeline.length > 0 ? formatNotatedKeySegments(notatedKeyTimeline, maxTime) : null;
  const notatedChordText =
    notatedChordTimeline.length > 0 ? notatedChordTimeline.map((c) => c.label).join(" → ") : null;

  const markovEvents = markovSequence
    ? markovSequence.map((pitchClass, i) => ({
        time: i * MARKOV_NOTE_DURATION_SEC,
        durationSeconds: MARKOV_NOTE_DURATION_SEC,
        midiNote: 60 + pitchClass,
        pitchClass,
        confidence: 1,
      }))
    : [];
  const markovMetrics = markovSequence
    ? {
        consonance: consonanceOfHistogram(pitchClassHistogram(markovEvents, 0, markovEvents.length * MARKOV_NOTE_DURATION_SEC)),
        predictability: conditionalPitchEntropy(markovEvents),
      }
    : null;

  const TabAccent = TAB_ACCENTS[activeTab];

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-xs font-medium tracking-[0.15em] text-navy">INPUT</p>
          <h1 className="mt-1 text-2xl font-semibold">{t.intro.heading}</h1>
          <p className="mt-2 text-sm text-zinc-500">{t.intro.description}</p>
        </div>

        <div>
          <p className="text-xs font-medium tracking-[0.15em] text-navy">{t.source.label}</p>
          <h2 className="mt-1 text-base font-semibold">{t.source.heading}</h2>
        </div>

        <div className="grid grid-cols-1 divide-y divide-zinc-200 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="relative flex flex-col gap-4 overflow-hidden p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute right-4 top-4 h-10 w-28 text-navy opacity-[0.12]"
            >
              <WaveformFragment className="h-full w-full" />
            </div>

            <div className="relative flex flex-1 flex-col gap-4">
              <div>
                <p className="text-xs font-medium tracking-[0.15em] text-navy">{t.audio.label}</p>
                <h3 className="mt-1 text-base font-semibold">{t.audio.heading}</h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t.audio.description}</p>
              </div>
              <SongUploader onReady={handleReady} disabled={status === "analyzing"} />
            </div>
          </div>

          <div className="relative flex flex-col gap-4 overflow-hidden p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute right-4 top-4 h-10 w-28 text-navy opacity-[0.12]"
            >
              <StaffFragment className="h-full w-full" />
            </div>

            <div className="relative flex flex-1 flex-col gap-4">
              <div>
                <p className="text-xs font-medium tracking-[0.15em] text-navy">{t.score.label}</p>
                <h3 className="mt-1 text-base font-semibold">{t.score.heading}</h3>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{t.score.description}</p>
              </div>
              <ScoreUploader onReady={handleScoreReady} disabled={status === "analyzing"} />
            </div>
          </div>
        </div>
      </div>

      {status === "analyzing" && (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 flex justify-between text-sm text-zinc-500">
            <span>{t.analyzing(label)}</span>
            <span>
              {t.elapsed((elapsedMs / 1000).toFixed(1))}
              {elapsedMs > SOFT_TARGET_MS && t.overTarget}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-[#2a78d6] transition-all dark:bg-[#3987e5]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {status === "error" && errorMessage && (
        <p className="rounded-lg border border-red-300 p-4 text-sm text-red-500">{t.analysisFailed(errorMessage)}</p>
      )}

      {status === "done" && (
        <div className="flex flex-col gap-6">
          {scoreWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
              <p className="mb-2 font-semibold text-amber-800 dark:text-amber-300">{t.warnings.heading}</p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800 dark:text-amber-300">
                {scoreWarnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.warnings.note}</p>
            </div>
          )}

          <PartSelector partNames={scorePartNames} selectedParts={selectedParts} onToggle={togglePart} />

          <div className="flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex gap-1">
              {TAB_ORDER.map((tabId) => (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={
                    activeTab === tabId
                      ? "border-b-2 border-navy px-4 py-2 text-sm text-navy"
                      : "border-b-2 border-transparent px-4 py-2 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
                  }
                >
                  {t.tabs[tabId]}
                </button>
              ))}
            </div>
            {TabAccent && (
              <TabAccent className="mb-2 hidden h-6 w-16 shrink-0 text-navy opacity-30 sm:block" />
            )}
          </div>

          {activeTab === "overview" && (
            <OverviewTab data={{ label, events, maxTime, histogram, histogramMax, partComposition, voices }} />
          )}
          {activeTab === "tonality" && (
            <TonalityTab data={{ keyTimeline, fourierTimeline, notatedKeyText }} />
          )}
          {activeTab === "harmony" && (
            <HarmonyTab
              data={{
                tonnetzTrajectory,
                aestheticMetrics,
                markovSequence,
                markovMetrics,
                onGenerateMarkov: handleGenerateMarkov,
                notatedChordText,
                counterpoint: counterpointAnalysis,
              }}
            />
          )}
          {activeTab === "expression" && (
            <ExpressionTab
              data={{
                tempo,
                rhythmEntropy,
                dynamics,
                valence,
                arousal,
                arc,
                meter: meterAnalysis,
                percussionOnsetCount: percussionOnsets.length,
              }}
            />
          )}
          {activeTab === "ai" && (
            <AIExplanationTab
              data={{
                summaryStatus,
                summaryError,
                onGenerateSummary: handleGenerateSummary,
                messages: aiMessages,
                followUpStatus,
                followUpError,
                onAskFollowUp: handleAskFollowUp,
              }}
            />
          )}
        </div>
      )}
    </main>
  );
}
