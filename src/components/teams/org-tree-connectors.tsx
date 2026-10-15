/* ------------------------------------------------------------------ */
/*  Connectors: the owner tier fanning out to each column              */
/*                                                                     */
/*  Curved rather than right-angled, so the tree reads as an orbit     */
/*  rather than a corporate flowchart. Every column is a fixed width,  */
/*  so the endpoints are arithmetic: nothing is measured, and nothing  */
/*  re-renders on resize.                                              */
/*                                                                     */
/*  Colours come from the `line` and `orbit-gold` tokens, never a raw  */
/*  white, so the lines hold up on the light theme too.                */
/* ------------------------------------------------------------------ */

/** Where the branch node sits below the top of the band. */
const NODE_Y = 22;

export function OrgTreeConnectors({
  width,
  height,
  columnCenters,
  dashedFrom,
}: {
  /** Width of the diagram, in px. */
  width: number;
  /** Height of the band between the owner tier and the columns. */
  height: number;
  /** Horizontal centre of each column, in px from the left of the diagram. */
  columnCenters: number[];
  /** Index from which columns are drawn dashed (the unassigned bucket). -1 for none. */
  dashedFrom: number;
}) {
  const x0 = width / 2;
  const y0 = NODE_Y;
  const y1 = height;
  const midY = (y0 + y1) / 2;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden>
      {/* Stem from the owner tier down to the branch node. */}
      <path d={`M ${x0} 0 L ${x0} ${y0}`} className="fill-none stroke-line/[0.16]" strokeWidth={1.5} />

      {columnCenters.map((x1, i) => {
        const dashed = dashedFrom !== -1 && i >= dashedFrom;
        return (
          <path
            key={i}
            d={`M ${x0} ${y0} C ${x0} ${midY}, ${x1} ${midY}, ${x1} ${y1}`}
            className={dashed ? "fill-none stroke-line/[0.09]" : "fill-none stroke-line/[0.16]"}
            strokeWidth={1.5}
            strokeDasharray={dashed ? "3 5" : undefined}
            strokeLinecap="round"
          />
        );
      })}

      <circle
        cx={x0}
        cy={y0}
        r={4.5}
        className="fill-orbit-gold"
        style={{ filter: "drop-shadow(0 0 6px rgb(var(--orbit-gold) / 0.7))" }}
      />
    </svg>
  );
}
