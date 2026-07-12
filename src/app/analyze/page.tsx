"use client";

import { useState } from "react";
import SongUploader from "@/components/SongUploader";
import ScoreUploader from "@/components/ScoreUploader";
import type { ScoreAnalysis, NotatedKeyPoint, NotatedChordPoint } from "@/lib/score/musicXml";
import { keyLabel } from "@/lib/theory/keyProfile";
import PianoRollViewer from "@/components/PianoRollViewer";
import KeyTimelineChart from "@/components/KeyTimelineChart";
import FourierTimelineChart from "@/components/FourierTimelineChart";
import TonnetzView from "@/components/TonnetzView";
import { analyzeSong } from "@/lib/audio/songAnalyzer";
import { notesToNormalizedEvents, pitchClassHistogram, NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";
import { estimateKeyTimeline } from "@/lib/theory/keyTimeline";
import { estimateFourierTimeline } from "@/lib/theory/fourierTimeline";
import { estimateTonnetzTrajectory } from "@/lib/theory/tonnetzTimeline";
import { PITCH_CLASS_NAMES, midiToNoteName } from "@/lib/audio/pitch";
import {
  analyzeAesthetics,
  buildPitchClassTransitionMatrix,
  generateMarkovSequence,
  consonanceOfHistogram,
  conditionalPitchEntropy,
} from "@/lib/theory/aestheticMetrics";
import { estimateTempo, rhythmicEntropy } from "@/lib/theory/rhythmAnalysis";
import { dynamicsSummary } from "@/lib/theory/dynamicsAnalysis";
import { estimateValence, estimateArousal, describeMoodQuadrant } from "@/lib/theory/emotionEstimate";
import { separateVoices } from "@/lib/theory/voiceSeparation";
import { estimateSongArc } from "@/lib/theory/songArc";
import MoodQuadrantChart from "@/components/MoodQuadrantChart";

type Status = "idle" | "analyzing" | "done" | "error";
type SummaryStatus = "idle" | "loading" | "done" | "error";

const SOFT_TARGET_MS = 30_000;
const HISTOGRAM_BAR_MAX_HEIGHT_PX = 128;
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
  const segments: { start: number; end: number; label: string }[] = [];
  for (const point of timeline) {
    const label = keyLabel(point);
    const last = segments[segments.length - 1];
    if (last && last.label === label) continue;
    segments.push({ start: point.time, end: durationSec, label });
  }
  for (let i = 0; i < segments.length - 1; i++) segments[i].end = segments[i + 1].start;
  return segments.map((s) => `${formatTime(s.start)}-${formatTime(s.end)} ${s.label}`).join(", ");
}

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
  const [notatedKeyTimeline, setNotatedKeyTimeline] = useState<NotatedKeyPoint[]>([]);
  const [notatedChordTimeline, setNotatedChordTimeline] = useState<NotatedChordPoint[]>([]);

  const handleReady = async (input: Blob | AudioBuffer, sourceLabel: string) => {
    setStatus("analyzing");
    setLabel(sourceLabel);
    setProgress(0);
    setElapsedMs(0);
    setErrorMessage(null);
    setNotatedKeyTimeline([]);
    setNotatedChordTimeline([]);

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

  const handleScoreReady = (analysis: ScoreAnalysis, sourceLabel: string) => {
    setStatus("done");
    setLabel(sourceLabel);
    setErrorMessage(null);
    setEvents(analysis.events);
    setNotatedKeyTimeline(analysis.notatedKeyTimeline);
    setNotatedChordTimeline(analysis.notatedChordTimeline);
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
          tonnetzTrajectory,
          metrics: aestheticMetrics,
          mood,
          arc,
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
  const tempo = events.length > 0 ? estimateTempo(events) : null;
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

  // partLabel is only set for score-imported events (see ScoreUploader/musicXml.ts);
  // audio-transcribed events leave it undefined, so this is naturally empty for that path.
  const partComposition = Object.entries(
    events.reduce<Record<string, number>>((counts, e) => {
      if (e.partLabel) counts[e.partLabel] = (counts[e.partLabel] ?? 0) + 1;
      return counts;
    }, {})
  );
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">曲を解析する</h1>
        <p className="mt-1 text-sm text-zinc-500">
          曲ファイルをアップロードするか、マイクで録音してください。Basic
          Pitch(ブラウザ内、和音・複数声部対応)で解析し、音符のタイムラインを表示します。
          1〜6分の曲で目安30秒以内に処理しますが、環境によってはそれ以上かかる場合があります。
          記譜ソフトをお使いの場合は、MusicXMLファイルを直接アップロードすることもできます(音声解析特有のピッチ推定誤りを回避できます)。
        </p>
      </div>

      <SongUploader onReady={handleReady} disabled={status === "analyzing"} />

      <div className="flex items-center gap-3 text-xs text-zinc-400">
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
        または
        <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>

      <ScoreUploader onReady={handleScoreReady} disabled={status === "analyzing"} />

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
            {partComposition.length > 0 && (
              <p className="mb-2 text-xs text-zinc-500">
                パート構成: {partComposition.map(([name, count]) => `${name}(${count}音)`).join("、")}
              </p>
            )}
            <PianoRollViewer events={events} />
          </div>

          {voices && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">抽出されたメロディーライン</h2>
              <p className="mb-3 text-xs text-zinc-500">
                各瞬間で最も高い音をメロディー、最も低い音をベース、残りを伴奏として分類しています(skyline
                algorithm)。この分離結果を、和音進行の検出やこの下の予測可能性・自己相似性の計算に使っています。
              </p>
              <div className="rounded-lg border border-zinc-200 p-4 text-xs dark:border-zinc-800">
                <p className="mb-2 text-zinc-500">
                  メロディー {voices.melody.length}音 / ベース {voices.bass.length}音 / 伴奏{" "}
                  {voices.accompaniment.length}音
                </p>
                <p className="break-words font-mono">
                  {voices.melody
                    .slice(0, 60)
                    .map((e) => midiToNoteName(e.midiNote))
                    .join(" → ")}
                  {voices.melody.length > 60 && " …"}
                </p>
              </div>
            </div>
          )}

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
            {notatedKeyText && (
              <p className="mt-2 text-xs text-zinc-500">
                記譜された調(推定ではなく楽譜に指定された値): {notatedKeyText}
              </p>
            )}
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">フーリエ解析の推移(ピッチクラス集合のDFT)</h2>
            <FourierTimelineChart timeline={fourierTimeline} />
          </div>

          <div>
            <h2 className="mb-2 text-lg font-semibold">Tonnetz軌跡(和音格子)</h2>
            <TonnetzView trajectory={tonnetzTrajectory} />
            {notatedChordText && (
              <p className="mt-2 break-words text-xs text-zinc-500">
                記譜されたコード進行(楽譜のコードネーム表記): {notatedChordText}
              </p>
            )}
          </div>

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

          {tempo && rhythmEntropy && dynamics && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">リズム・強弱の推定</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MetricCard
                  title="テンポ"
                  theory="オンセット密度の自己相関によるビート周期推定"
                  formula="argmax_τ r(τ)、bpm = 60 / τ"
                  value={`約 ${tempo.bpm} BPM`}
                  note={tempo.confidence === "low" ? "確信度低(規則的な拍を検出できず)" : "規則的な拍を検出"}
                />
                <MetricCard
                  title="リズムの複雑さ"
                  theory="音価分布のシャノンエントロピー"
                  formula="H = -Σ p(bucket) log₂ p(bucket)"
                  value={`${rhythmEntropy.entropyBits.toFixed(2)} bit (最大 ${rhythmEntropy.maxEntropyBits.toFixed(2)} bit)`}
                  note="値が大きいほど音価のバリエーションが豊富"
                />
                <MetricCard
                  title="強弱(ダイナミクス)"
                  theory="音符振幅(Basic Pitchのamplitude)の区間平均"
                  formula="range = max(区間平均) - min(区間平均)"
                  value={`平均 ${dynamics.averageLoudness.toFixed(2)} / レンジ ${dynamics.dynamicRange.toFixed(2)}`}
                  note={
                    dynamics.trend === "crescendo"
                      ? "だんだん強くなる傾向"
                      : dynamics.trend === "diminuendo"
                        ? "だんだん弱くなる傾向"
                        : "おおむね一定"
                  }
                />
              </div>
            </div>
          )}

          {valence !== null && arousal !== null && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">感情・印象の推定(Russellの感情円環モデル)</h2>
              <p className="mb-3 text-xs text-zinc-500">
                キー(長調/短調)・協和度・テンポ・強弱・リズムの複雑さから合成した仮説的な推定です。検証済みの感情認識モデルではありません。
              </p>
              <MoodQuadrantChart valence={valence} arousal={arousal} />
            </div>
          )}

          {arc.length > 0 && (
            <div>
              <h2 className="mb-2 text-lg font-semibold">曲の推移(メロディーの変化点で区切った区間ごと)</h2>
              <p className="mb-3 text-xs text-zinc-500">
                固定の等分割ではなく、メロディーのピッチクラス分布の変化(novelty検出)から区間の切れ目を検出しています。
                明確な変化点が無い曲は1区間のままになります。各区間で協和度・強弱・感情推定を再計算し、曲がどう変化していくかを見るためのものです。
              </p>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
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
                      <td className="p-3 text-zinc-500">協和度(平均Γ)</td>
                      {arc.map((s) => (
                        <td key={s.startSec} className="p-3">
                          {s.consonance.averageGradus.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <td className="p-3 text-zinc-500">強弱(平均音量)</td>
                      {arc.map((s) => (
                        <td key={s.startSec} className="p-3">
                          {s.dynamics.averageLoudness.toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="p-3 text-zinc-500">感情推定</td>
                      {arc.map((s) => (
                        <td key={s.startSec} className="p-3">
                          {describeMoodQuadrant(s.valence, s.arousal)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
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
