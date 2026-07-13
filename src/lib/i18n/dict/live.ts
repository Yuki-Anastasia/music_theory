import type { Locale } from "../locale";
import type { MicInputLabels } from "@/components/MicInput";

interface LiveDict {
  label: string;
  heading: string;
  description: string;
  pitchClassPrefix: string;
  confidence: string;
  resolution: string;
  resolutionFast: string;
  resolutionLow: string;
  bufferLatency: string;
  processingTime: string;
  totalLatency: string;
  overTarget: string;
  privacyNote: string;
  placeholder: string;
  mic: MicInputLabels;
}

export const liveDict: Record<Locale, LiveDict> = {
  ja: {
    label: "LIVE",
    heading: "ライブモード",
    description: "マイクに向かって単音を歌う・楽器を弾く・口笛を吹くなどすると、検出された周波数とノートがリアルタイムに表示されます。",
    pitchClassPrefix: "ピッチクラス",
    confidence: "信頼度(dB基準)",
    resolution: "解析窓",
    resolutionFast: "速い(2048)",
    resolutionLow: "低音用(4096)",
    bufferLatency: "バッファ由来の遅延",
    processingTime: "YIN処理時間(平均)",
    totalLatency: "合計目安",
    overTarget: "(目標超過)",
    privacyNote: "音声はブラウザ内で処理され、サーバーには送信されません。",
    placeholder: "ー",
    mic: {
      status: {
        idle: "マイクを有効化",
        requesting: "許可を待っています…",
        listening: "リスニング中(停止)",
        denied: "マイクが拒否されました",
        error: "エラーが発生しました",
      },
      deniedHint: "ブラウザの設定でマイクの権限を許可してください。HTTPS(またはlocalhost)が必要です。",
    },
  },
  en: {
    label: "LIVE",
    heading: "Live Mode",
    description: "Sing a single note, play an instrument, or whistle into your mic, and the detected frequency and note are shown in real time.",
    pitchClassPrefix: "pitch class",
    confidence: "Confidence (dB-based)",
    resolution: "Analysis window",
    resolutionFast: "Fast (2048)",
    resolutionLow: "Low-note (4096)",
    bufferLatency: "Buffer-induced latency",
    processingTime: "YIN processing time (avg)",
    totalLatency: "Total estimate",
    overTarget: "(over target)",
    privacyNote: "Audio is processed entirely in your browser and never sent to a server.",
    placeholder: "—",
    mic: {
      status: {
        idle: "Enable microphone",
        requesting: "Waiting for permission…",
        listening: "Listening (stop)",
        denied: "Microphone access denied",
        error: "An error occurred",
      },
      deniedHint: "Please allow microphone access in your browser settings. HTTPS (or localhost) is required.",
    },
  },
};
