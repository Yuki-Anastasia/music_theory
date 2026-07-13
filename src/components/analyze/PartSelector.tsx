"use client";

import SectionHeader from "@/components/analyze/SectionHeader";

export interface PartSelectorProps {
  /** Every part/instrument name found across the loaded file(s), in document order. */
  partNames: string[];
  /** Currently included part names — everything downstream (piano roll, harmony, counterpoint, AI summary) is recomputed from only these. */
  selectedParts: Set<string>;
  onToggle: (name: string) => void;
}

/**
 * Lets the user include/exclude individual instrument parts from the
 * analysis — both parts found within a single multi-track file (a Guitar
 * Pro tab with Guitar/Bass/Drums tracks) and parts merged in from separate
 * uploaded files share this one list, since scoreMerge.ts already unifies
 * them into the same partNames/partLabel scheme. Only rendered when there's
 * an actual choice to make (2+ parts) — a single-part score has nothing to
 * toggle.
 */
export default function PartSelector({ partNames, selectedParts, onToggle }: PartSelectorProps) {
  if (partNames.length < 2) return null;

  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <SectionHeader
        label="PART SELECTION"
        heading="解析するパートを選択"
        description="この楽譜には複数の楽器パートが含まれています。チェックを外すと、そのパートを解析対象から除外できます(既定では全パートを結合して解析します)。ピアノロール・和声・対位法・AIによる解説など、以降のすべての解析はここで選択したパートのみを対象に再計算されます。"
      />
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {partNames.map((name) => (
          <label key={name} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selectedParts.has(name)}
              onChange={() => onToggle(name)}
              className="h-4 w-4 accent-navy"
            />
            {name}
          </label>
        ))}
      </div>
      {selectedParts.size === 0 && (
        <p className="mt-2 text-xs text-red-500">少なくとも1つのパートを選択してください。</p>
      )}
    </div>
  );
}
