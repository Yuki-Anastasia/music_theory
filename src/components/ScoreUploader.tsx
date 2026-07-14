"use client";

import { useCallback, useState } from "react";
import type { ScoreAnalysis } from "@/lib/score/musicXml";
import { parseAndMergeScoreFiles } from "@/lib/score/scoreMerge";
import type { ScoreConsistencyWarning } from "@/lib/score/scoreConsistency";
import { useDict, useLocale } from "@/lib/i18n/LocaleProvider";
import { uploadersDict } from "@/lib/i18n/dict/uploaders";

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
  const t = useDict(uploadersDict).score;
  const { locale } = useLocale();
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
        const { analysis, label, warnings } = await parseAndMergeScoreFiles(files, locale);
        setParseState("idle");
        onReady(analysis, label, warnings);
      } catch (err) {
        setParseState("error");
        setErrorMessage(err instanceof Error ? err.message : String(err));
      }
    },
    [onReady, locale]
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-full bg-foreground px-5 py-2 font-medium text-background">
          {t.chooseFile}
          <input
            type="file"
            accept=".musicxml,.xml,.mxl,.gp3,.gp4,.gp5,.gpx,.gp"
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled || parseState === "parsing"}
          />
        </label>
        {parseState === "parsing" && <span className="text-xs text-zinc-500">{t.parsing}</span>}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-400">{t.description}</p>
      {parseState === "error" && errorMessage && <p className="text-sm text-red-500">{errorMessage}</p>}
    </div>
  );
}
