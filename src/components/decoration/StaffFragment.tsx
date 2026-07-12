/**
 * Ambient decoration: a fragment of a 5-line musical staff with a few
 * sparse abstract noteheads. Pure decoration — never a real transcription.
 */
export default function StaffFragment({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 60"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none ${className ?? ""}`}
    >
      <g stroke="currentColor" strokeWidth={1} fill="none">
        {[10, 20, 30, 40, 50].map((y) => (
          <line key={y} x1={0} y1={y} x2={200} y2={y} />
        ))}
      </g>
      <g fill="currentColor">
        <ellipse cx={36} cy={40} rx={4.5} ry={3.2} transform="rotate(-18 36 40)" />
        <line x1={40} y1={39} x2={40} y2={14} stroke="currentColor" strokeWidth={1} />

        <ellipse cx={92} cy={20} rx={4.5} ry={3.2} transform="rotate(-18 92 20)" />
        <line x1={96} y1={21} x2={96} y2={46} stroke="currentColor" strokeWidth={1} />

        <ellipse cx={150} cy={30} rx={4.5} ry={3.2} transform="rotate(-18 150 30)" />
        <line x1={154} y1={29} x2={154} y2={6} stroke="currentColor" strokeWidth={1} />
      </g>
    </svg>
  );
}
