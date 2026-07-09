"use client";

import { useMicPitch } from "@/lib/audio/useMicPitch";
import MicInput from "@/components/MicInput";
import { midiToNoteName } from "@/lib/audio/pitch";

/**
 * Day-1 proof of concept (spec Part A-2-1 / Part E): the single highest-risk
 * item in the plan is real-time mic pitch-detection latency. This page does
 * nothing but mic -> frequency/note display + latency numbers, so that risk
 * gets measured before any module code is built on top of it.
 */
export default function MicPoCPage() {
  const { status, reading, latency, errorMessage, start, stop } = useMicPitch();

  const totalLatencyMs =
    latency != null ? latency.bufferLatencyMs + latency.avgProcessingMs : null;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Day-1 PoC: マイク → 周波数表示</h1>
        <p className="mt-1 text-sm text-zinc-500">
          目標: 検出遅延 &lt; 100ms(バッファ2048 @ 44.1kHz ≈ 46ms + 処理時間)。
          単音を歌う/口笛を吹くなどして実測してください。
        </p>
      </div>

      <MicInput status={status} errorMessage={errorMessage} onStart={start} onStop={stop} />

      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        {reading ? (
          <div className="flex flex-col gap-2 font-mono text-lg">
            <div>
              周波数: <span className="font-bold">{reading.frequency.toFixed(2)} Hz</span>
            </div>
            <div>
              ノート: <span className="font-bold">{midiToNoteName(reading.midiNote)}</span>{" "}
              ({reading.centsOff > 0 ? "+" : ""}
              {reading.centsOff.toFixed(1)}¢)
            </div>
            <div>ピッチクラス: {reading.pitchClass}</div>
            <div>信頼度(RMS基準): {(reading.confidence * 100).toFixed(0)}%</div>
          </div>
        ) : (
          <p className="text-zinc-400">
            {status === "listening" ? "音を検出していません(無音または閾値未満)" : "マイク未接続"}
          </p>
        )}
      </div>

      {latency && (
        <div className="rounded-lg border border-zinc-200 p-6 font-mono text-sm dark:border-zinc-800">
          <p className="mb-2 font-sans font-semibold text-base">レイテンシ実測</p>
          <div>バッファ由来の遅延(固定): {latency.bufferLatencyMs.toFixed(1)} ms</div>
          <div>YIN処理時間(直近): {latency.lastProcessingMs.toFixed(2)} ms</div>
          <div>YIN処理時間(直近30フレーム平均): {latency.avgProcessingMs.toFixed(2)} ms</div>
          <div className="mt-2 font-bold">
            合計目安: {totalLatencyMs?.toFixed(1)} ms{" "}
            {totalLatencyMs != null && (
              <span className={totalLatencyMs < 100 ? "text-green-600" : "text-red-500"}>
                ({totalLatencyMs < 100 ? "目標達成" : "目標超過 — バッファ/処理の見直しが必要"})
              </span>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
