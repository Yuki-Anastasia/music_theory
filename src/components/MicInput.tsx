"use client";

import { MicPitchStatus } from "@/lib/audio/useMicPitch";

interface MicInputProps {
  status: MicPitchStatus;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
}

const STATUS_LABEL: Record<MicPitchStatus, string> = {
  idle: "マイクを有効化",
  requesting: "許可を待っています…",
  listening: "リスニング中(停止)",
  denied: "マイクが拒否されました",
  error: "エラーが発生しました",
};

/** Shared mic-permission button + status, per the plan's common-component list. */
export default function MicInput({ status, errorMessage, onStart, onStop }: MicInputProps) {
  const isListening = status === "listening";

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={isListening ? onStop : onStart}
        disabled={status === "requesting"}
        className="rounded-full bg-foreground px-5 py-2 text-background font-medium disabled:opacity-50"
      >
        {STATUS_LABEL[status]}
      </button>
      {status === "denied" && (
        <p className="text-sm text-red-500">
          ブラウザの設定でマイクの権限を許可してください。HTTPS(またはlocalhost)が必要です。
        </p>
      )}
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}
