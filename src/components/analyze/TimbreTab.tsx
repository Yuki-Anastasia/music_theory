import InstrumentTagsPanel from "@/components/InstrumentTagsPanel";
import type { InstrumentTagWindow } from "@/lib/audio/instrumentTagger";

export interface TimbreTabData {
  instrumentTags: InstrumentTagWindow[];
  instrumentTagsStatus: "idle" | "loading" | "done" | "error";
  instrumentTagsError: string | null;
}

export default function TimbreTab({ data }: { data: TimbreTabData }) {
  const { instrumentTags, instrumentTagsStatus, instrumentTagsError } = data;

  return (
    <div className="flex flex-col gap-6">
      {instrumentTagsStatus === "loading" && (
        <p className="text-xs text-zinc-500">楽器・声質タグを推定中…</p>
      )}
      {instrumentTagsStatus === "error" && instrumentTagsError && (
        <p className="text-xs text-zinc-500">
          楽器・声質タグの推定に失敗しました(YAMNetモデルが未配置の可能性があります): {instrumentTagsError}
        </p>
      )}
      <InstrumentTagsPanel windows={instrumentTags} />
    </div>
  );
}
