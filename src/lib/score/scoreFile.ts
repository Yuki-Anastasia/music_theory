import { parseScoreFile } from "./musicXml";
import { parseGuitarProFile } from "./guitarPro";
import type { ScoreAnalysis } from "./musicXml";

const TAB_EXTENSIONS = [".gp3", ".gp4", ".gp5", ".gpx", ".gp"];

export function isTabFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return TAB_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Routes a file to the MusicXML or Guitar Pro parser by extension. Shared between the single-file and multi-file upload paths so they can't drift. */
export async function parseAnyScoreFile(file: File): Promise<ScoreAnalysis> {
  return isTabFile(file.name) ? parseGuitarProFile(file) : parseScoreFile(file);
}
