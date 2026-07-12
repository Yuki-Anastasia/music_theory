"use client";

import { useCallback, useState } from "react";
import { parseScoreFile } from "@/lib/score/musicXml";
import type { NormalizedNoteEvent } from "@/lib/theory/normalizedEvents";

interface ScoreUploaderProps {
  onReady: (events: NormalizedNoteEvent[], label: string) => void;
  disabled?: boolean;
}

type ParseState = "idle" | "parsing" | "error";

/**
 * Alternate entry point (pattern B): imports a MusicXML file exported
 * directly from notation software (Finale/Sibelius/Dorico/MuseScore),
 * skipping Basic Pitch's audio-based pitch estimation entirely. The score
 * data is the composer's ground truth, so it sidesteps the polyphonic
 * pitch-estimation ambiguity that audio transcription is inherently subject
 * to.
 */
export default function ScoreUploader({ onReady, disabled }: ScoreUploaderProps) {
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // allow re-selecting the same file later
      if (!file) return;

      setParseState("parsing");
      setErrorMessage(null);
      try {
        const events = await parseScoreFile(file);
        setParseState("idle");
        onReady(events, file.name);
      } catch (err) {
        setParseState("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [onReady]
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full border border-zinc-300 px-5 py-2 font-medium disabled:opacity-50 dark:border-zinc-700">
          楽譜ファイルを選択(MusicXML)
          <input
            type="file"
            accept=".musicxml,.xml,.mxl"
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || parseState === "parsing"}
          />
        </label>
        {parseState === "parsing" && <span className="text-sm text-zinc-500">解析中…</span>}
      </div>
      <p className="text-xs text-zinc-500">
        Finale/Sibelius/Dorico/MuseScoreなどからエクスポートした.musicxml/.xml/.mxlファイルを読み込みます。
        音声を経由せず、記譜データそのものを解析するため、和音のピッチ推定に音声解析特有の誤りが生じません。
      </p>
      {parseState === "error" && errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
