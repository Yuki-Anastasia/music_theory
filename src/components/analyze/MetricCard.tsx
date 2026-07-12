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
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-zinc-500">{theory}</p>
      <p className="mt-2 font-mono text-xs text-zinc-500">{formula}</p>
      <p className="mt-2 text-base font-medium">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{note}</p>
    </div>
  );
}
