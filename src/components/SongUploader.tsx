"use client";

import { useCallback, useRef, useState } from "react";
import { startPcmRecording, PcmRecorderHandle } from "@/lib/audio/pcmRecorder";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { uploadersDict } from "@/lib/i18n/dict/uploaders";

interface SongUploaderProps {
  onReady: (input: Blob | AudioBuffer, label: string) => void;
  disabled?: boolean;
}

type RecordState = "idle" | "requesting" | "recording" | "denied" | "error";

/**
 * Common entry point for song input (spec's dual-path architecture): either
 * upload an audio file, or record from the mic. Recording captures raw PCM
 * directly (see pcmRecorder.ts) rather than going through MediaRecorder,
 * which sidesteps a Chrome bug where decodeAudioData() throws "Unable to
 * decode audio data" for MediaRecorder's WebM/Opus output.
 */
export default function SongUploader({ onReady, disabled }: SongUploaderProps) {
  const t = useDict(uploadersDict).song;
  const [recordState, setRecordState] = useState<RecordState>("idle");
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recorderRef = useRef<PcmRecorderHandle | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onReady(file, file.name);
      e.target.value = ""; // allow re-selecting the same file later
    },
    [onReady]
  );

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const buffer = recorder.stop();
    recorderRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRecordState("idle");
    setRecordSeconds(0);
    onReady(buffer, t.recordedLabel);
  }, [onReady, t.recordedLabel]);

  const startRecording = useCallback(async () => {
    setRecordState("requesting");
    setErrorMessage(null);
    try {
      recorderRef.current = await startPcmRecording();
      setRecordState("recording");
      setRecordSeconds(0);
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      if (err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
        setRecordState("denied");
      } else {
        setRecordState("error");
      }
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const isRecording = recordState === "recording";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full bg-foreground px-5 py-2 font-medium text-background">
          {t.chooseFile}
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || isRecording}
          />
        </label>

        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled || recordState === "requesting"}
          className="rounded-full border border-zinc-300 px-5 py-2 font-medium disabled:opacity-50 dark:border-zinc-700"
        >
          {isRecording ? t.recordStop(recordSeconds) : t.recordStart}
        </button>
      </div>

      {recordState === "denied" && <p className="text-sm text-red-500">{t.micDenied}</p>}
      {recordState === "error" && errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
