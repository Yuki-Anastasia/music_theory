"use client";

import { MicPitchStatus } from "@/lib/audio/useMicPitch";

export interface MicInputLabels {
  status: Record<MicPitchStatus, string>;
  deniedHint: string;
}

interface MicInputProps {
  status: MicPitchStatus;
  errorMessage: string | null;
  onStart: () => void;
  onStop: () => void;
  labels: MicInputLabels;
}

/** Shared mic-permission button + status, per the plan's common-component list. */
export default function MicInput({ status, errorMessage, onStart, onStop, labels }: MicInputProps) {
  const isListening = status === "listening";

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={isListening ? onStop : onStart}
        disabled={status === "requesting"}
        className="rounded-full bg-foreground px-5 py-2 text-background font-medium disabled:opacity-50"
      >
        {labels.status[status]}
      </button>
      {status === "denied" && <p className="text-sm text-red-500">{labels.deniedHint}</p>}
      {status === "error" && errorMessage && (
        <p className="text-sm text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}
