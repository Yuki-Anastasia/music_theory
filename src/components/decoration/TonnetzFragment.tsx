const NODES: [number, number][] = [
  [20, 10], [50, 10], [80, 10],
  [5, 40], [35, 40], [65, 40], [95, 40],
  [20, 70], [50, 70], [80, 70],
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2],
  [3, 4], [4, 5], [5, 6],
  [7, 8], [8, 9],
  [0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6],
  [3, 7], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9],
];

/** Ambient decoration: a small fixed triangular node lattice, evoking the Tonnetz — not the real geometry generator. */
export default function TonnetzFragment({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 80"
      aria-hidden="true"
      focusable="false"
      className={`pointer-events-none ${className ?? ""}`}
    >
      <g stroke="currentColor" strokeWidth={0.75} opacity={0.7}>
        {EDGES.map(([a, b], i) => {
          const [x1, y1] = NODES[a];
          const [x2, y2] = NODES[b];
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      <g fill="currentColor">
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.2} />
        ))}
      </g>
    </svg>
  );
}
