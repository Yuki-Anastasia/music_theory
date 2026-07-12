"use client";

import { useMicPitch } from "@/lib/audio/useMicPitch";
import MicInput from "@/components/MicInput";
import SignalSpectrogram from "@/components/SignalSpectrogram";
import WaveformDisplay from "@/components/WaveformDisplay";
import { midiToNoteName } from "@/lib/audio/pitch";

/**
 * Real-time mic input: pitch/note detection running entirely in the
 * browser (YIN algorithm), with a dual-resolution detector (a fast window
 * for normal-to-high notes, a slower window for low notes) so both ranges
 * stay responsive.
 */
export default function LivePage() {
  const { status, reading, latency, errorMessage, start, stop, analyserRef } = useMicPitch();

  const totalLatencyMs =
    latency != null ? latency.bufferLatencyMs + latency.avgProcessingMs : null;

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">ライブモード</h1>
        <p className="mt-1 text-sm text-zinc-500">
          マイクに向かって単音を歌う・楽器を弾く・口笛を吹くなどすると、検出された周波数とノートがリアルタイムに表示されます。
          音声はブラウザ内で処理され、サーバーには送信されません。
        </p>
      </div>

      <MicInput status={status} errorMessage={errorMessage} onStart={start} onStop={stop} />

      <WaveformDisplay analyserRef={analyserRef} isActive={status === "listening"} />
      <SignalSpectrogram analyserRef={analyserRef} isActive={status === "listening"} hasSignal={!!reading} />

      <div className="rounded-lg border border-zinc-200 p-6 dark:border-zinc-800">
        {status === "listening" || reading ? (
          <div className="flex flex-col gap-2 font-mono text-lg">
            <div>
              周波数: <span className="font-bold">{reading ? `${reading.frequency.toFixed(2)} Hz` : "ー"}</span>
            </div>
            <div>
              ノート:{" "}
              <span className="font-bold">
                {reading
                  ? `${midiToNoteName(reading.midiNote)} (${reading.centsOff > 0 ? "+" : ""}${reading.centsOff.toFixed(1)}¢)`
                  : "ー"}
              </span>
            </div>
            <div>ピッチクラス: {reading ? reading.pitchClass : "ー"}</div>
            <div>信頼度(dB基準): {reading ? `${(reading.confidence * 100).toFixed(0)}%` : "ー"}</div>
            <div>
              解析窓: {reading ? (reading.resolution === "fast" ? "速い(2048)" : "低音用(4096)") : "ー"}
            </div>
          </div>
        ) : (
          <p className="text-zinc-400">マイク未接続</p>
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
