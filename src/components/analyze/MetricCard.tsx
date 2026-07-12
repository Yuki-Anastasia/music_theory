/**
 * A single measured quantity, presented like a scientific figure caption:
 * the value is the dominant element, the formula is a secondary
 * mathematical annotation, everything else is small supporting text. Not a
 * KPI dashboard tile — sparse chrome, no background fill.
 */
export default function MetricCard({
  title,
  theory,
  formula,
  value,
  note,
}: {
  title: string;
  theory: string;
  formula: string;
  value: string;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-zinc-200 pl-4 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{title}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="font-mono text-xs text-navy">{formula}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
        {theory}・{note}
      </p>
    </div>
  );
}
