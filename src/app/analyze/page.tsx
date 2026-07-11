"use client";

import { useState } from "react";
import SongUploader from "@/components/SongUploader";
import PianoRollViewer from "@/components/PianoRollViewer";
import KeyTimelineChart from "@/components/KeyTimelineChart";
import FourierTimelineChart from "@/components/FourierTimelineChart";
import TonnetzView from "@/components/TonnetzView";
import InstrumentTagsPanel from "@/components/InstrumentTagsPanel";
import { analyzeSong } from "@/lib/audio/songAnalyzer";
import { analyzeInstruments, InstrumentTagWindow } from "@/lib/audio/instrumentTagger";
import { notesToNormalizedEvents, pitchClassHistogram, NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import { estimateKeyTimeline } from "@/lib/theory/keyTimeline";
import { estimateFourierTimeline } from "@/lib/theory/fourierTimeline";
import { estimateTonnetzTrajectory } from "@/lib/theory/tonnetzTimeline";
import { PITCH_CLASS_NAMES } from "@/lib/audio/pitch";
import {
  analyzeAesthetics,
  buildPitchClassTransitionMatrix,
  generateMarkovSequence,
  consonanceOfHistogram,
  conditionalPitchEntropy,
} from "@/lib/theory/aestheticMetrics";

type Status = "idle" | "analyzing" | "done" | "error";
type SummaryStatus = "idle" | "loading" | "done" | "error";

const SOFT_TARGET_MS = 30_000;
const HISTOGRAM_BAR_MAX_HEIGHT_PX = 128;
const MARKOV_SEQUENCE_LENGTH = 32;
const MARKOV_NOTE_DURATION_SEC = 0.5;

function MetricCard({
  title,
  theory,
  formula,
  value,
  note,
}: {
  title: string;
  theory: string;
  formula: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">{theory}</p>
      <p className="mt-2 font-mono text-xs text-zinc-500">{formula}</p>
      <p className="mt-2 text-base font-medium">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}

export default function AnalyzeSongPage() {
  const [status, setStatus] = useState<Status>("idle");
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
          <div>
            <h2 className="mb-2 text-lg font-semibold">
              ピアノロール({label}、{events.length}音、{maxTime.toFixed(1)}秒)
            </h2>
            <PianoRollViewer events={events} />
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">ピッチクラス・ヒストグラム(鳴っていた時間の合計)</h2>
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
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">キーの推移(Krumhansl-Schmuckler)</h2>
            <KeyTimelineChart timeline={keyTimeline} />
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">フーリエ解析の推移(ピッチクラス集合のDFT)</h2>
            <FourierTimelineChart timeline={fourierTimeline} />
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">Tonnetz軌跡(和音格子)</h2>
            <TonnetzView trajectory={tonnetzTrajectory} />
          </div>

          {instrumentTagsStatus === "loading" && (
            <p className="text-xs text-zinc-500">楽器・声質タグを推定中…</p>
          )}
          {instrumentTagsStatus === "error" && instrumentTagsError && (
            <p className="text-xs text-zinc-500">
              楽器・声質タグの推定に失敗しました(YAMNetモデルが未配置の可能性があります): {instrumentTagsError}
            </p>
          )}
          <InstrumentTagsPanel windows={instrumentTags} />

          {aestheticMetrics && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">美しさと相関しうる数理的特徴</h2>
              <p className="mb-3 text-xs text-zinc-500">
                これらは「美しさの証明」ではありません。音楽理論・情報理論上の名前のついた指標との、数学的な相関を示す仮説的な視点です。
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MetricCard
                  title="協和度"
                  theory="オイラーの快さの尺度 (Gradus Suavitatis, 1739)"
                  formula="Γ(n) = 1 + Σ aᵢ(pᵢ - 1)"
                  value={`平均 Γ = ${aestheticMetrics.consonance.averageGradus.toFixed(2)}`}
                  note="値が小さいほど協和的(完全五度Γ=4、短二度Γ=11)"
                />
                <MetricCard
                  title="和声的テンション"
                  theory="声部進行の最小移動距離 (Neo-Riemannian理論)"
                  formula="min Σᵢ dist(aᵢ, b_perm(i))"
                  value={`平均 ${aestheticMetrics.harmonicTension.averageVoiceLeadingDistance.toFixed(2)}半音 / 最大 ${aestheticMetrics.harmonicTension.maxVoiceLeadingDistance.toFixed(2)}半音`}
                  note="値が大きいほど、遠い和音への跳躍"
                />
                <MetricCard
                  title="予測可能性"
                  theory="シャノンの条件付きエントロピー (情報理論, 1948)"
                  formula="H(Xₙ₊₁|Xₙ) = -Σ p(a,b)log₂p(b|a)"
                  value={`${aestheticMetrics.predictability.conditionalEntropyBits.toFixed(2)} bit (最大 ${aestheticMetrics.predictability.maxEntropyBits.toFixed(2)} bit)`}
                  note="値が小さいほど、次の音が予測しやすい"
                />
                <MetricCard
                  title="旋律の自己相似性"
                  theory="自己相関によるモチーフ検出"
                  formula="r(τ) = Σ(x[n]-μ)(x[n+τ]-μ) / Σ(x[n]-μ)²"
                  value={`ラグ${aestheticMetrics.selfSimilarity.bestLagNotes}音で相関 ${aestheticMetrics.selfSimilarity.correlation.toFixed(2)}`}
                  note="1に近いほど、その間隔で旋律が反復"
                />
              </div>
            </div>
          )}

          <div>
            <h2 className="mb-2 text-lg font-semibold">アルゴリズムによる生成(1次マルコフ連鎖)</h2>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <p className="mb-3 text-xs text-zinc-500">
                曲中のピッチクラス遷移確率(上の「予測可能性」と同じ行列)から、次の音を確率的にサンプリングして新しい音列を生成します。
                元の曲を作曲したアルゴリズムの再現ではなく、統計的性質を近似する単純な1次マルコフモデルによる生成です。
              </p>
              <button
                onClick={handleGenerateMarkov}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background"
              >
                生成する
              </button>

              {markovSequence && (
                <div className="mt-3">
                  <p className="break-words font-mono text-sm">
                    {markovSequence.map((pc) => PITCH_CLASS_NAMES[pc]).join(" → ")}
                  </p>
                  {markovMetrics && aestheticMetrics && (
                    <table className="mt-3 text-xs">
                      <thead>
                        <tr className="text-left text-zinc-500">
                          <th className="pb-1 pr-4 font-normal"></th>
                          <th className="pb-1 pr-4 font-normal">元の曲</th>
                          <th className="pb-1 font-normal">生成列</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="pr-4 text-zinc-500">協和度(平均Γ)</td>
                          <td className="pr-4">{aestheticMetrics.consonance.averageGradus.toFixed(2)}</td>
                          <td>{markovMetrics.consonance.averageGradus.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td className="pr-4 text-zinc-500">予測可能性(bit)</td>
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

          <div>
            <h2 className="mb-2 text-lg font-semibold">AIによる解説</h2>
            <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <button
                onClick={handleGenerateSummary}
                disabled={summaryStatus === "loading"}
                className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {summaryStatus === "loading" ? "生成中…" : "AIによる解説を生成"}
              </button>

              {summaryStatus === "error" && summaryError && (
                <p className="mt-3 text-sm text-red-500">{summaryError}</p>
              )}

              {summaryStatus === "done" && summaryText && (
                <div className="mt-3">
                  <p className="whitespace-pre-wrap text-sm">{summaryText}</p>
                  <p className="mt-2 text-xs text-zinc-400">
                    Claude(Anthropic)による生成。上記の数値解析結果のみを根拠にしています。
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
