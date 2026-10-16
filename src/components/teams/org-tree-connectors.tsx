/* ------------------------------------------------------------------ */
/*  Connectors: each owner fanning out to their own departments        */
/*                                                                     */
/*  Curved rather than right-angled, so the tree reads as an orbit     */
/*  rather than a corporate flowchart. Every card is a fixed width, so */
/*  the endpoints are arithmetic: nothing is measured, and nothing     */
/*  re-renders on resize.                                              */
/*                                                                     */
/*  A department wired to an Owner in Admin Tools hangs from that      */
/*  Owner's card. Anything not wired yet, and the "not in a            */
/*  department" bucket, hangs from one shared node under the middle of */
/*  the owner row, the way the whole tree did before.                  */
/*                                                                     */
/*  Colours come from the `line` and `orbit-gold` tokens, never a raw  */
/*  white, so the lines hold up on the light theme too.                */
/* ------------------------------------------------------------------ */

/** Where a branch node sits below the top of the band. */
const NODE_Y = 22;

export interface Branch {
  /** Horizontal centre of the card or node this branch comes from. */
  fromX: number;
  /** Horizontal centre of each column it feeds. */
  toX: number[];
  /** The "not in a department" bucket is drawn dashed. */
  dashed?: boolean[];
}

export function OrgTreeConnectors({
  width,
  height,
  branches,
}: {
  /** Width of the diagram, in px. */
  width: number;
  /** Height of the band between the owner tier and the columns. */
  height: number;
  branches: Branch[];
}) {
  const y0 = NODE_Y;
  const y1 = height;
  const midY = (y0 + y1) / 2;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden>
      {branches.map((branch, b) => (
        <g key={b}>
          {/* Stem from the card down to its branch node. */}
          <path
            d={`M ${branch.fromX} 0 L ${branch.fromX} ${y0}`}
            className="fill-none stroke-line/[0.16]"
            strokeWidth={1.5}
          />

          {branch.toX.map((x1, i) => {
            const dashed = branch.dashed?.[i] ?? false;
            return (
              <path
                key={i}
                d={`M ${branch.fromX} ${y0} C ${branch.fromX} ${midY}, ${x1} ${midY}, ${x1} ${y1}`}
                className={dashed ? "fill-none stroke-line/[0.09]" : "fill-none stroke-line/[0.16]"}
                strokeWidth={1.5}
                strokeDasharray={dashed ? "3 5" : undefined}
                strokeLinecap="round"
              />
            );
          })}

          <circle
            cx={branch.fromX}
            cy={y0}
            r={4.5}
            className="fill-orbit-gold"
            style={{ filter: "drop-shadow(0 0 6px rgb(var(--orbit-gold) / 0.7))" }}
          />
        </g>
      ))}
    </svg>
  );
}
