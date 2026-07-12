"use client";

import { useState } from "react";
import SongUploader from "@/components/SongUploader";
import OverviewTab from "@/components/analyze/OverviewTab";
import TonalityTab from "@/components/analyze/TonalityTab";
import HarmonyTab from "@/components/analyze/HarmonyTab";
import TimbreTab from "@/components/analyze/TimbreTab";
import AIExplanationTab, { SummaryStatus } from "@/components/analyze/AIExplanationTab";
import { analyzeSong } from "@/lib/audio/songAnalyzer";
import { analyzeInstruments, InstrumentTagWindow } from "@/lib/audio/instrumentTagger";
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

type Status = "idle" | "analyzing" | "done" | "error";
type TabId = "overview" | "tonality" | "harmony" | "timbre" | "ai";

const SOFT_TARGET_MS = 30_000;
const MARKOV_SEQUENCE_LENGTH = 32;
const MARKOV_NOTE_DURATION_SEC = 0.5;

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "概要" },
  { id: "tonality", label: "調性" },
  { id: "harmony", label: "和声" },
  { id: "timbre", label: "音色" },
  { id: "ai", label: "AI解説" },
];

export default function AnalyzeSongPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [label, setLabel] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [events, setEvents] = useState<NormalizedNoteEvent[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [markovSequence, setMarkovSequence] = useState<number[] | null>(null);
  const [instrumentTags, setInstrumentTags] = useState<InstrumentTagWindow[]>([]);
  const [instrumentTagsStatus, setInstrumentTagsStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [instrumentTagsError, setInstrumentTagsError] = useState<string | null>(null);

  const handleReady = async (input: Blob | AudioBuffer, sourceLabel: string) => {
    setStatus("analyzing");
    setLabel(sourceLabel);
    setProgress(0);
    setElapsedMs(0);
    setErrorMessage(null);
    setInstrumentTagsStatus("loading");
    setInstrumentTagsError(null);

    // Runs independently of the Basic Pitch pipeline below — a slow or
    // failing instrument tagger (e.g. the YAMNet model isn't in place yet)
    // must not block the note analysis from completing and displaying.
    void analyzeInstruments(input)
      .then((tags) => {
        setInstrumentTags(tags);
        setInstrumentTagsStatus("done");
      })
      .catch((err) => {
        setInstrumentTagsError(err instanceof Error ? err.message : String(err));
        setInstrumentTagsStatus("error");
      });

    try {
      const notes = await analyzeSong(input, ({ fraction, elapsedMs: ms }) => {
        setProgress(fraction);
        setElapsedMs(ms);
      });
      setEvents(notesToNormalizedEvents(notes));
      setStatus("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const handleGenerateMarkov = () => {
    if (events.length === 0) return;
    const matrix = buildPitchClassTransitionMatrix(events);
    setMarkovSequence(generateMarkovSequence(matrix, events[0].pitchClass, MARKOV_SEQUENCE_LENGTH));
  };

  const handleGenerateSummary = async () => {
    setSummaryStatus("loading");
    setSummaryError(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          durationSec: maxTime,
          keyTimeline,
          fourierTimeline,
          tonnetzTrajectory,
          metrics: aestheticMetrics,
          instrumentTags,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI解説の生成に失敗しました");
      setSummaryText(data.summary);
      setSummaryStatus("done");
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err));
      setSummaryStatus("error");
    }
  };

  const maxTime = events.length > 0 ? Math.max(...events.map((e) => e.time + e.durationSeconds)) : 0;
  const histogram = events.length > 0 ? pitchClassHistogram(events, 0, maxTime) : [];
  const histogramMax = Math.max(1, ...histogram);
  const keyTimeline = events.length > 0 ? estimateKeyTimeline(events) : [];
  const fourierTimeline = events.length > 0 ? estimateFourierTimeline(events) : [];
  const tonnetzTrajectory = events.length > 0 ? estimateTonnetzTrajectory(events) : [];
  const aestheticMetrics = events.length > 0 ? analyzeAesthetics(events, histogram, tonnetzTrajectory) : null;

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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">曲を解析する</h1>
        <p className="mt-1 text-sm text-zinc-500">
          曲ファイルをアップロードするか、マイクで録音してください。Basic
          Pitch(ブラウザ内、和音・複数声部対応)で解析し、音符のタイムラインを表示します。
          1〜6分の曲で目安30秒以内に処理しますが、環境によってはそれ以上かかる場合があります。
        </p>
      </div>

      <SongUploader onReady={handleReady} disabled={status === "analyzing"} />

      {status === "analyzing" && (
        <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-2 flex justify-between text-sm text-zinc-500">
            <span>解析中: {label}</span>
            <span>
              {(elapsedMs / 1000).toFixed(1)}s経過
              {elapsedMs > SOFT_TARGET_MS && "(目安の30秒を超えています)"}
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
        <p className="rounded-lg border border-red-300 p-4 text-sm text-red-500">解析に失敗しました: {errorMessage}</p>
      )}

      {status === "done" && (
        <div className="flex flex-col gap-6">
          <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={
                  activeTab === tab.id
                    ? "border-b-2 border-[#2a78d6] px-4 py-2 text-sm font-semibold text-[#2a78d6] dark:border-[#3987e5] dark:text-[#3987e5]"
                    : "border-b-2 border-transparent px-4 py-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                }
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <OverviewTab data={{ label, events, maxTime, histogram, histogramMax }} />
          )}
          {activeTab === "tonality" && <TonalityTab data={{ keyTimeline, fourierTimeline }} />}
          {activeTab === "harmony" && (
            <HarmonyTab
              data={{
                tonnetzTrajectory,
                aestheticMetrics,
                markovSequence,
                markovMetrics,
                onGenerateMarkov: handleGenerateMarkov,
              }}
            />
          )}
          {activeTab === "timbre" && (
            <TimbreTab data={{ instrumentTags, instrumentTagsStatus, instrumentTagsError }} />
          )}
          {activeTab === "ai" && (
            <AIExplanationTab
              data={{ summaryStatus, summaryText, summaryError, onGenerateSummary: handleGenerateSummary }}
            />
          )}
        </div>
      )}
    </main>
  );
}
