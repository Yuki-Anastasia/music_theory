import type { ScoreAnalysis, MeterPoint, NotatedKeyPoint, NotatedChordPoint } from "./musicXml";
import type { NormalizedNoteEvent } from "../theory/normalizedEvents";
import type { FileScoreAnalysis, ScoreConsistencyWarning } from "./scoreConsistency";
import { checkConsistency } from "./scoreConsistency";
import { parseAnyScoreFile } from "./scoreFile";
import type { Locale } from "../i18n/locale";

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, "");
}

/**
 * Merges multiple already-parsed score files into a single ScoreAnalysis —
 * one combined performance timeline for the theory modules to run on. Each
 * file's parser already outputs absolute seconds, so events are simply
 * concatenated and re-sorted; there's no time-shifting or alignment
 * correction here, only checkConsistency's warnings (computed separately,
 * see parseAndMergeScoreFiles) to flag when that "same timeline" assumption
 * looks wrong.
 *
 * Part labeling: a single-part file (the common "one instrument per file"
 * export) is always tagged with its filename, since that's the label the
 * uploader directly chose and will recognize — not whatever internal part
 * name the authoring software happened to save, which risks colliding
 * across files (two different files both internally named "Guitar"). A
 * file that already contains multiple parts keeps its own part names,
 * prefixed with the filename for uniqueness.
 */
export function mergeScoreAnalyses(files: FileScoreAnalysis[]): ScoreAnalysis {
  const events: NormalizedNoteEvent[] = [];
  const partNames: string[] = [];
  const notatedChordTimeline: NotatedChordPoint[] = [];
  const percussionOnsets: number[] = [];

  for (const { fileName, analysis } of files) {
    const baseLabel = stripExtension(fileName);
    const isSinglePart = analysis.partNames.length <= 1;

    for (const event of analysis.events) {
      const partLabel = isSinglePart ? baseLabel : `${baseLabel} - ${event.partLabel ?? "?"}`;
      events.push({ ...event, partLabel });
    }

    partNames.push(...(isSinglePart ? [baseLabel] : analysis.partNames.map((name) => `${baseLabel} - ${name}`)));
    notatedChordTimeline.push(...analysis.notatedChordTimeline);
    percussionOnsets.push(...analysis.percussionOnsets);
  }

  events.sort((a, b) => a.time - b.time);
  notatedChordTimeline.sort((a, b) => a.time - b.time);
  percussionOnsets.sort((a, b) => a - b);

  // Key/meter/tempo are taken from the first file only, rather than merged
  // — there's no principled way to combine two different notated key/time
  // signatures/tempos into one, and checkConsistency already flags when
  // they disagree across files. Percussion onsets, by contrast, are pure
  // beat indicators with no such "which one is right" ambiguity, so they're
  // pooled from every file.
  const reference = files[0]?.analysis;
  const notatedKeyTimeline: NotatedKeyPoint[] = reference?.notatedKeyTimeline ?? [];
  const meterTimeline: MeterPoint[] = reference?.meterTimeline ?? [];
  const notatedTempoBpm: number | null = reference?.notatedTempoBpm ?? null;

  return { events, notatedKeyTimeline, notatedChordTimeline, partNames, meterTimeline, notatedTempoBpm, percussionOnsets };
}

export interface MergedScoreResult {
  analysis: ScoreAnalysis;
  warnings: ScoreConsistencyWarning[];
  label: string;
}

/**
 * Entry point for the multi-file upload path: parses every file (routed by
 * extension via parseAnyScoreFile), runs the consistency check, and merges
 * the results into one ScoreAnalysis. Works fine for a single file too
 * (warnings always empty then, since checkConsistency needs 2+), so
 * ScoreUploader can use this one code path regardless of how many files
 * were selected.
 */
export async function parseAndMergeScoreFiles(files: File[], locale: Locale = "ja"): Promise<MergedScoreResult> {
  const fileAnalyses: FileScoreAnalysis[] = await Promise.all(
    files.map(async (file) => ({ fileName: file.name, analysis: await parseAnyScoreFile(file) }))
  );

  return {
    analysis: mergeScoreAnalyses(fileAnalyses),
    warnings: checkConsistency(fileAnalyses, locale),
    label: files.map((f) => f.name).join(" + "),
  };
}
