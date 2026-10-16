"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { ChartDepartment, OrgChart } from "@/app/actions/org-chart";
import { InteractiveCard } from "@/components/ui/interactive-card";
import { DepartmentGlass, DepartmentIcon, departmentShade } from "@/components/ui/department-glass";
import { UserAvatar } from "@/components/ui/user-avatar";
import { tintOf, type DepartmentTint } from "@/lib/members/department-tint";
import { cardWires, layOutChart, type LaidOutCard } from "@/lib/members/chart-layout";
import { descendantsOf } from "@/lib/members/org-chart";
import { memberDisplayName } from "@/lib/members/profile";
import { RANK_LABEL, rankOf, type Rank } from "@/lib/members/rank";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";

import { CountPill, ManageButton, PersonRow, TreeAvatar, type TreeNodeContext } from "./org-tree-person";

/* ------------------------------------------------------------------ */
/*  The Teams tree: the Admin Tools chart, drawn as the card tree      */
/*                                                                     */
/*  Every card sits exactly where Internal Management left it on the   */
/*  canvas in Admin Tools, at the canvas's own card widths, joined by  */
/*  the same wires. Only the look is Teams': the tree's glass cards in */
/*  each rank's colour, and each department naming its Head: whoever   */
/*  is wired directly above it. Members get a card once Internal       */
/*  Management puts them on the canvas; the rest are listed below.     */
/*  It can't be dragged or rewired here; that happens in Admin Tools.  */
/*                                                                     */
/*  Card heights aren't known until they render, so the cards are      */
/*  measured and the wires drawn from the measurements. The whole      */
/*  chart scales down to fit the page, and scrolls past a floor where  */
/*  text would get too small to read.                                  */
/* ------------------------------------------------------------------ */

const PAD = 32;
const MIN_SCALE = 0.6;
/** Used for a card's height until it has been measured. */
const GUESS_HEIGHT = 120;

/* The card's rim in the rank's colour. No words: the halo says the rank. */
const RANK_RING: Record<Rank, string> = {
  OWNER: "ring-orbit-gold/35",
  EXECUTIVE: "ring-orbit-violet/35",
  MANAGER: "ring-orbit-blue/30",
  TEAM_LEAD: "ring-orbit-teal/30",
  MEMBER: "ring-line/[0.08]",
};

interface OrgChartMirrorProps extends TreeNodeContext {
  chart: OrgChart;
  /** The roster, for descriptors and presence; the chart carries only names. */
  memberById: ReadonlyMap<string, Member>;
  canManage: (member: Member) => boolean;
}

export function OrgChartMirror({
  chart,
  memberById,
  canManage,
  ...context
}: OrgChartMirrorProps) {
  const cards = useMemo(() => layOutChart(chart), [chart]);
  const wires = useMemo(() => cardWires(chart.parents, new Set(cards.map((c) => c.id))), [chart.parents, cards]);

  // Shift everything so the top-left card sits at the padding.
  const minX = Math.min(0, ...cards.map((c) => c.position.x));
  const minY = Math.min(0, ...cards.map((c) => c.position.y));
  const at = (card: LaidOutCard<unknown, unknown>) => ({
    x: card.position.x - minX + PAD,
    y: card.position.y - minY + PAD,
  });

  /* ---- Measuring ---- */
  const [heights, setHeights] = useState<Record<string, number>>({});
  const nodes = useRef(new Map<string, HTMLDivElement>());
  useLayoutEffect(() => {
    const observer = new ResizeObserver((entries) => {
      setHeights((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.card;
          const h = Math.round((entry.target as HTMLElement).offsetHeight);
          if (id && next[id] !== h) {
            next[id] = h;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    });
    nodes.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [cards]);

  const heightOf = (id: string) => heights[id] ?? GUESS_HEIGHT;
  const byId = new Map(cards.map((c) => [c.id, c]));
  const contentWidth = Math.max(0, ...cards.map((c) => at(c).x + c.width)) + PAD;
  const contentHeight = Math.max(0, ...cards.map((c) => at(c).y + heightOf(c.id))) + PAD;

  /* ---- Fitting the page ---- */
  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(0);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setAvailable(el.clientWidth));
    observer.observe(el);
    setAvailable(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  const scale = available > 0 ? Math.max(MIN_SCALE, Math.min(1, available / contentWidth)) : 1;

  /* ---- Counts on department cards, by rank under them ---- */
  const roleByNode = useMemo(
    () => new Map(chart.people.map((p) => [`p:${p.id}`, p.role])),
    [chart.people]
  );

  // Members not on the canvas have no card: listed under the chart, not lost.
  const onChart = new Set(cards.map((c) => c.id));
  const unplaced = chart.people.filter((p) => p.role === "MEMBER" && !onChart.has(`p:${p.id}`));

  const member = (person: { id: string; name: string; photoURL: string | null; role: Member["role"] }): Member =>
    memberById.get(person.id) ?? ({ ...person, email: "", orgId: "" } as unknown as Member);

  return (
    <div className="flex flex-col gap-8">
      {cards.length === 0 ? (
        <p className="text-[13px] font-light text-ink-muted">
          Nothing on the chart yet. Internal Management builds it in Admin Tools.
        </p>
      ) : (
        <div ref={frame} className="overflow-x-auto pb-4">
          <div className="mx-auto" style={{ width: contentWidth * scale, height: contentHeight * scale }}>
            <div
              className="relative origin-top-left"
              style={{ width: contentWidth, height: contentHeight, transform: `scale(${scale})` }}
            >
              <svg width={contentWidth} height={contentHeight} className="pointer-events-none absolute inset-0" aria-hidden>
                {wires.map(({ from, to }) => {
                  const a = byId.get(from)!;
                  const b = byId.get(to)!;
                  const x0 = at(a).x + a.width / 2;
                  const y0 = at(a).y + heightOf(a.id);
                  const x1 = at(b).x + b.width / 2;
                  const y1 = at(b).y;
                  const mid = (y0 + y1) / 2;
                  return (
                    <path
                      key={`${from}->${to}`}
                      d={`M ${x0} ${y0} C ${x0} ${mid}, ${x1} ${mid}, ${x1} ${y1}`}
                      className="fill-none stroke-line/[0.18]"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  );
                })}
                {[...new Set(wires.map((w) => w.from))].map((from) => {
                  const a = byId.get(from)!;
                  return (
                    <circle
                      key={from}
                      cx={at(a).x + a.width / 2}
                      cy={at(a).y + heightOf(a.id)}
                      r={4}
                      className="fill-orbit-gold"
                      style={{ filter: "drop-shadow(0 0 6px rgb(var(--orbit-gold) / 0.7))" }}
                    />
                  );
                })}
              </svg>

              {cards.map((card) => (
                <div
                  key={card.id}
                  data-card={card.id}
                  ref={(el) => {
                    if (el) nodes.current.set(card.id, el);
                    else nodes.current.delete(card.id);
                  }}
                  className="absolute"
                  style={{ left: at(card).x, top: at(card).y, width: card.width }}
                >
                  {card.kind === "DEPARTMENT" ? (
                    <DepartmentMirrorCard
                      department={card.department}
                      under={descendantsOf(card.id, chart.parents).map((n) => roleByNode.get(n))}
                      head={card.head ? member(card.head) : null}
                      context={context}
                    />
                  ) : (
                    <PersonMirrorCard
                      person={member(card.person)}
                      rank={card.kind}
                      reportsTo={card.reportsTo}
                      tint={card.tint}
                      context={context}
                      canManage={canManage}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {unplaced.length > 0 && (
        <div className="flex w-full flex-col gap-3 rounded-3xl border border-dashed border-line/[0.14] bg-surface-sunken/30 p-6 sm:max-w-md">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-light tracking-tight text-ink-dim">
              Not on the chart yet
            </h3>
            <CountPill value={unplaced.length} label={`${unplaced.length} not on the chart`} />
          </div>
          <div className="space-y-1">
            {unplaced.map((p) => (
              <PersonRow
                key={p.id}
                member={member(p)}
                tier="member"
                context={context}
                manageable={canManage(member(p))}
                muted
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PersonMirrorCard({
  person,
  rank,
  reportsTo,
  tint,
  context,
  canManage,
}: {
  person: Member;
  rank: Rank;
  /** "Reports to …", from the shared chart layout; null for Owners. */
  reportsTo: string | null;
  /** The shade of the department they sit in, or null when in none. */
  tint: DepartmentTint | null;
  context: TreeNodeContext;
  canManage: (member: Member) => boolean;
}) {
  const name = memberDisplayName(person);
  const shade = departmentShade(tint);
  const isSelf = person.id === context.viewerId;

  return (
    /* Everyone in a department wears its shade, the same as on the canvas.
       The card itself takes no style, so the shade sits in a layer behind
       its glass. */
    <div style={shade.style} className={cn("rounded-[20px]", shade.className && cn("ring-1 ring-inset", shade.className))}>
    <InteractiveCard surface="fog" className={cn("w-full rounded-[20px] p-3", RANK_RING[rank])}>
      {/* Nothing is cut short: every line wraps instead, so a long name,
          title or "Reports to" reads in full at the canvas's card width. */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => context.onOpenProfile(person.id)}
            aria-label={`View ${name}'s profile`}
            className="relative z-10 flex min-w-0 flex-1 items-start gap-2.5 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <TreeAvatar member={person} tier="member" status={context.presenceOf(person.id)} rank={rank} />
            {/* No rank tag: the halo says it. The rank stays readable to a
                screen reader, which can't see a colour. */}
            <span className="min-w-0 flex-1 pt-1">
              <span className="sr-only">{RANK_LABEL[rank]}, </span>
              <span className="block break-words text-[13px] font-light leading-snug tracking-tight text-ink">
                {name}
              </span>
            </span>
          </button>
          {canManage(person) && <ManageButton name={name} onClick={() => context.onManage(person.id)} />}
        </div>

        {(person.roleDescriptor || isSelf) && (
          <p className="break-words text-[11px] leading-snug text-ink-dim">
            {[person.roleDescriptor, isSelf && "You"].filter(Boolean).join(" · ")}
          </p>
        )}
        {reportsTo && <p className="break-words text-[11px] leading-snug text-ink-muted">{reportsTo}</p>}
      </div>
    </InteractiveCard>
    </div>
  );
}

function DepartmentMirrorCard({
  department,
  under,
  head,
  context,
}: {
  department: ChartDepartment;
  under: (string | undefined)[];
  /** Whoever is wired directly above the department: its Head of Department. */
  head: Member | null;
  context: TreeNodeContext;
}) {
  const managers = under.filter((r) => r === "MANAGER").length;
  const leads = under.filter((r) => r === "TEAM_LEAD").length;
  const members = under.filter((r) => r === "MEMBER").length;
  const total = managers + leads + members;
  // Only what the department actually has: a zero is not shown at all.
  const stats = [
    { label: managers === 1 ? "Manager" : "Managers", value: managers },
    { label: leads === 1 ? "Team Lead" : "Team Leads", value: leads },
    { label: members === 1 ? "Member" : "Members", value: members },
  ].filter((stat) => stat.value > 0);

  /* The shared department skin, in the colour Internal Management chose,
     laid out like the canvas card. Unlike the canvas, nothing is clamped:
     Teams shows every name in full. */
  return (
    <DepartmentGlass tint={tintOf(department)} className="p-4">
      <div className="flex items-start gap-3">
        <DepartmentIcon icon={department.icon} />
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="break-words text-[15px] font-medium leading-snug tracking-tight text-ink-strong">
            {department.name}
          </h3>
          {/* In full, unlike the canvas's two lines: Teams shows everything. */}
          {department.description && (
            <p className="mt-0.5 break-words text-[11.5px] leading-snug text-ink-muted">{department.description}</p>
          )}
          <p className="mt-0.5 text-[11px] text-ink-dim">
            {total === 0 ? "Nobody in it yet" : `${total} ${total === 1 ? "person" : "people"}`}
          </p>
        </div>
      </div>

      <div className="mt-3.5 flex items-center gap-2.5 rounded-[14px] bg-base/30 px-2.5 py-2 ring-1 ring-inset ring-[rgb(var(--tint)/0.18)]">
        {head ? (
          <button
            type="button"
            onClick={() => context.onOpenProfile(head.id)}
            className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <UserAvatar photoURL={head.photoURL} name={memberDisplayName(head)} size="sm" rank={rankOf(head.role, false)} />
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] uppercase tracking-[0.08em] text-ink-dim">Head of department</span>
              <span className="block break-words text-[13px] leading-snug text-ink">{memberDisplayName(head)}</span>
            </span>
          </button>
        ) : (
          <span className="py-1 text-[12px] text-ink-dim">No head yet</span>
        )}
      </div>

      {stats.length > 0 && (
      <dl
        className={cn(
          "mt-2.5 grid gap-1.5 text-center",
          stats.length === 1 ? "grid-cols-1" : stats.length === 2 ? "grid-cols-2" : "grid-cols-3"
        )}
      >
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[12px] bg-[rgb(var(--tint)/0.10)] px-1 py-1.5 ring-1 ring-inset ring-[rgb(var(--tint)/0.16)]"
          >
            <dd className="font-mono text-[15px] tabular-nums text-ink-strong">{stat.value}</dd>
            <dt className="break-words text-[10px] leading-tight text-ink-dim">{stat.label}</dt>
          </div>
        ))}
      </dl>
      )}
    </DepartmentGlass>
  );
}
