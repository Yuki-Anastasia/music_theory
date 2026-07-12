"use client";

import { useCallback, useState } from "react";
import type { ScoreAnalysis } from "@/lib/score/musicXml";
import { parseAndMergeScoreFiles } from "@/lib/score/scoreMerge";
import type { ScoreConsistencyWarning } from "@/lib/score/scoreConsistency";

interface ScoreUploaderProps {
  onReady: (analysis: ScoreAnalysis, label: string, warnings: ScoreConsistencyWarning[]) => void;
  disabled?: boolean;
}

type ParseState = "idle" | "parsing" | "error";

/**
 * Alternate entry point (pattern B): imports score files exported directly
 * from notation/tab software — MusicXML (Finale/Sibelius/Dorico/MuseScore)
 * or Guitar Pro tab (.gp3/.gp4/.gp5/.gpx/.gp) — skipping Basic Pitch's
 * audio-based pitch estimation entirely. The score/tab data is the
 * author's ground truth, so it sidesteps the polyphonic pitch-estimation
 * ambiguity that audio transcription is inherently subject to.
 *
 * Accepts multiple files at once for the common "one instrument exported
 * per file" workflow (e.g. a band's Guitar/Bass/Drums each saved
 * separately) — they're merged into a single combined timeline by
 * scoreMerge.ts, which assumes every file is the same performance at the
 * same tempo/starting point. There's no way to auto-correct a
 * misalignment, so parseAndMergeScoreFiles also runs a consistency check
 * (duration/tempo/key/meter) and surfaces any mismatches as warnings
 * rather than blocking the upload.
 */
export default function ScoreUploader({ onReady, disabled }: ScoreUploaderProps) {
  const [parseState, setParseState] = useState<ParseState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = ""; // allow re-selecting the same file(s) later
      if (files.length === 0) return;

      setParseState("parsing");
      setErrorMessage(null);
      try {
        const { analysis, label, warnings } = await parseAndMergeScoreFiles(files);
        setParseState("idle");
        onReady(analysis, label, warnings);
      } catch (err) {
        setParseState("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [onReady]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-zinc-700">
          楽譜/タブ譜ファイルを選択(複数可)
          <input
            type="file"
            accept=".musicxml,.xml,.mxl,.gp3,.gp4,.gp5,.gpx,.gp"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || parseState === "parsing"}
          />
        </label>
        {parseState === "parsing" && <span className="text-xs text-zinc-500">解析中…</span>}
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        Finale/Sibelius/Dorico/MuseScoreなどからエクスポートした.musicxml/.xml/.mxlファイル、または
        Guitar Proのタブ譜ファイル(.gp3/.gp4/.gp5/.gpx/.gp)を読み込みます。
        音声を経由せず、記譜データそのものを解析するため、和音のピッチ推定に音声解析特有の誤りが生じません。
        複数ファイルを同時に選択すると(例:ギター・ベース・ドラムをそれぞれ別ファイルでエクスポートした場合)、
        1つの曲として結合して解析します。ファイル間で長さ・テンポ・調・拍子が大きく異なる場合は警告を表示します。
      </p>
      {parseState === "error" && errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
