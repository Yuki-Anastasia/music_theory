"use client";

import KeyTimelineChart from "@/components/KeyTimelineChart";
import FourierTimelineChart from "@/components/FourierTimelineChart";
import SectionHeader from "@/components/analyze/SectionHeader";
import type { KeyTimelinePoint } from "@/lib/theory/keyTimeline";
import type { FourierTimelinePoint } from "@/lib/theory/fourierTimeline";
import { useDict } from "@/lib/i18n/LocaleProvider";
import { tonalityTabDict } from "@/lib/i18n/dict/tonalityTab";

export interface TonalityTabData {
  keyTimeline: KeyTimelinePoint[];
  fourierTimeline: FourierTimelinePoint[];
  /** Key as notated in a MusicXML score import (null for audio-transcribed songs). */
  notatedKeyText: string | null;
}

export default function TonalityTab({ data }: { data: TonalityTabData }) {
  const { keyTimeline, fourierTimeline, notatedKeyText } = data;
  const t = useDict(tonalityTabDict);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <SectionHeader {...t.keyTimeline} />
        <KeyTimelineChart timeline={keyTimeline} />
        {notatedKeyText && <p className="mt-2 text-xs text-zinc-500">{t.notatedKey(notatedKeyText)}</p>}
      </div>

      <div>
        <SectionHeader {...t.fourierTimeline} />
        <FourierTimelineChart timeline={fourierTimeline} />
      </div>
    </div>
  );
}
