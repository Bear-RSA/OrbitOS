# Teams — Org Tree view

Implementation spec for a new "Tree" view on `/teams`, alongside the existing roster grid. Visual reference (mockup): https://claude.ai/artifact/UsTQYApbSsuRdVuSLB9HmK

## Why

`src/app/teams/page.tsx` currently renders a flat, workload-sorted roster grid. The hierarchy data model already exists and is unused by the UI:

- `src/types/department.ts` — `Department { id, orgId, name, leadId, createdAt }`
- `src/lib/members/hierarchy.ts` — `buildOrgTree(people, departments, primaryOwnerId) → OrgTree<P>`, where `OrgTree = { primary, coOwners, departments: DepartmentBranch[], unassigned }` and `DepartmentBranch = { department, lead, members }`
- `src/app/actions/team-structure.ts` — `getTeamStructureAction()` returns `{ primaryOwnerId, departments, ownerSeats, limitsEnforced, departmentLimit }`; comment explicitly says this exists for "the Teams tree."

This spec covers rendering `buildOrgTree(...)` as a tree instead of building new data plumbing.

## Scope

Add a view toggle to `/teams` (**Roster | Tree**) that doesn't replace the existing grid — it's a second way to look at the same roster. Default stays Roster; selection can be local `useState`, no persistence required for v1.

## Data flow

```
getTeamStructureAction() → { primaryOwnerId, departments, ownerSeats, ... }
+ existing member list (already fetched for the roster grid)
→ buildOrgTree(members, departments, primaryOwnerId)
→ <OrgTree tree={tree} />
```

`buildOrgTree` is a pure function — no new server action needed beyond what `team-structure.ts` already exposes.

## Component structure

New files under `src/components/teams/`:

- `org-tree.tsx` — top-level layout: owner row, connectors, department branches, unassigned bucket. Takes `OrgTree<Member>`.
- `org-tree-owner-card.tsx` — primary owner / co-owner card (two size variants).
- `org-tree-department-card.tsx` — one department panel: header, lead row (or empty state), member rows.
- `org-tree-connectors.tsx` — the curved SVG lines fanning from the owner node to each department/unassigned column.

Wire into `src/app/teams/page.tsx`: a `view: "roster" | "tree"` state; render `<OrgTree tree={buildOrgTree(members, departments, primaryOwnerId)} />` when `view === "tree"`.

## Visual spec

No new design tokens — everything maps to existing CSS vars / Tailwind classes from `tailwind.config.ts` + `globals.css`.

**Cards**
- Owner card: `rounded-[32px]`, `InteractiveCard surface="fog"` (reuse the existing component), ring color `border-orbit-gold` (primary) / `border-orbit-violet` (co-owner).
- Department card: `rounded-3xl` (24px), same `surface="fog"` glass treatment, `p-6`, flex column, `gap-4`.
- Unassigned bucket: same shape, `border-dashed border-line`, lower-opacity fill, `text-ink-faint` throughout — visually a "not yet placed" terminal, not a real department.

**Avatars**
- Rounded-square, not circular: `rounded-2xl` at 56px (owner), `rounded-xl` at 34–46px (leads/co-owner), `rounded-lg` at 28px (members) — matches the roster grid's avatar treatment, reuse `UserAvatar` if it supports a square variant, otherwise a local avatar div.
- Presence/workload dot: existing `statusConfig` colors (`orbit-red` critical/overdue, `orbit-amber` heavy/blocked, `orbit-green` balanced, `orbit-blue` light), bottom-right overlapping the avatar corner.

**Typography**
- Headings/labels: `font-sans font-light` as elsewhere on this page (`text-5xl font-light tracking-tighter` for "Team").
- Person names specifically: `font-serif` (Tailwind default serif stack — matches the roster grid's existing name treatment, no new font import).
- Captions/eyebrows (`Lead`, `Primary owner`, department counts): `text-[11px] uppercase tracking-wide text-ink-faint`.
- Counts: `font-mono tabular-nums`, zero-padded, in a small `bg-surface-control rounded-full` pill — matches the page's existing numeric convention.

**Connectors**
Curved (not right-angled) SVG paths from a single glowing node below the owner tier, fanning out to each department/unassigned column — evokes the app's orbit motif rather than a corporate flowchart. Cubic bezier, vertical tangent at both ends:

```
M {x0} {y0} C {x0} {midY}, {x1} {midY}, {x1} {y1}
```
where `x0,y0` = owner-tier bottom-center, `x1,y1` = target column's top-center, `midY = (y0+y1)/2`. Stroke `rgba(255,255,255,0.16)`, 1.5px, no fill. The unassigned connector uses a fainter, dashed stroke (`rgba(255,255,255,0.09)`, `stroke-dasharray: 3 5`). A small node (8–10px circle, `bg-orbit-gold`, soft glow) marks the branch point.

**Background**
Reuse the page's existing orbit backdrop / `GlassSurface` treatment — don't hand-roll a new starfield per view; if `/teams` doesn't already have one, this is a candidate to add at the shell level, not per-view.

## Layout

Desktop-first: a fixed-width diagram (~1588px at the grid used in the mockup: 5 columns × 260px + 48px gutters + 48px margins) centered in the page, with `overflow-x: auto` on its wrapper so it scrolls horizontally rather than squeezing illegibly below that width. Department cards are `width: 260px`, height auto (content-driven) — nothing below them depends on an exact height. A true responsive pass (e.g. collapsing to a vertical accordion per department under ~900px) is out of scope for v1 and worth a follow-up if the Tree view ships broadly rather than as an internal/desktop tool.

## Empty / edge states

- Department with no lead (`lead === null`): dashed circle placeholder + `No lead assigned` in `italic text-ink-faint`, same row height as a populated lead row so cards stay visually aligned.
- Empty department (no members): keep the header + lead row, omit the divider/members block, maybe a one-line `No members yet`.
- `unassigned.length === 0`: omit the bucket column entirely rather than showing an empty dashed card.
- `departments.length === 0`: show a single empty state inviting the owner to create a department (reuse `createDepartmentAction`), not a blank tree.

## Not covered here

Drag-to-reassign, inline department creation/rename from the tree view, and the responsive collapse are deliberately left for a follow-up — this spec is for the read-only tree render matching the mockup.
