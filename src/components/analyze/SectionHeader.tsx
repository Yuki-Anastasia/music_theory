export interface SectionHeaderProps {
  /** Small tracked English category label, e.g. "TONAL STRUCTURE". */
  label: string;
  /** Japanese heading — the primary interface language. */
  heading: string;
  description?: string;
}

/** Shared section intro: English label + Japanese heading + short explanation, used above every major analysis visualization. */
export default function SectionHeader({ label, heading, description }: SectionHeaderProps) {
  return (
    <div className="mb-4">
      <p className="text-xs font-medium tracking-[0.15em] text-navy">{label}</p>
      <h2 className="mt-1 text-lg font-semibold">{heading}</h2>
      {description && (
        <p className="mt-2 max-w-2xl text-xs leading-relaxed text-zinc-500">{description}</p>
      )}
    </div>
  );
}
