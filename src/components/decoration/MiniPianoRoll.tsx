const BARS: [number, number, number][] = [
  // [x, y, width] — height fixed per bar
  [10, 12, 24],
  [38, 28, 16],
  [58, 20, 34],
  [96, 44, 20],
  [20, 52, 14],
  [118, 12, 18],
  [70, 60, 28],
];

const BAR_HEIGHT = 5;

/** Ambient decoration: abstract note bars at varied pitch/duration, plus a faint key-axis reference line. */
export default function MiniPianoRoll({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 160 80"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none ${className ?? ""}`}
    >
      <line x1={0} y1={36} x2={160} y2={36} stroke="currentColor" strokeWidth={0.5} strokeDasharray="2,3" opacity={0.5} />
      <g fill="currentColor">
        {BARS.map(([x, y, w], i) => (
          <rect key={i} x={x} y={y} width={w} height={BAR_HEIGHT} rx={1} />
        ))}
      </g>
    </svg>
  );
}
