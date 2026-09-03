# OrbitOS — In-App Calling: Build Prompt

You are working in the **OrbitOS** codebase (Next.js 15 App Router, TypeScript, Firebase Firestore + Admin SDK, Resend, PayFast billing, Tailwind, zod, vitest). Add **live audio/video calling** inside the app.

Before writing anything, read these files to ground yourself in the existing conventions — do NOT invent patterns that already exist:
- `src/types/event.ts`, `src/types/guest.ts`, `src/types/member.ts`
- `src/app/actions/events.ts`, `src/app/actions/rsvp.ts`
- `src/lib/guests/registry.ts`, `src/lib/calendar/rsvp-token.ts`, `src/lib/calendar/presence.ts`
- `src/lib/auth/permissions.ts` (esp. `resolveGuestInviteLimit`)
- `src/components/dashboard/personnel-hub.tsx`
- `src/app/rsvp/[token]/page.tsx`
- `firestore.rules`

## Provider strategy (important)
- **Use Daily (daily.co) as the media provider for now.** Bigger, simpler free tier; Daily Prebuilt gives a working room fast.
- **We will switch to LiveKit when we scale** (self-hostable, cheaper at volume). So the provider MUST sit behind a thin, swappable interface — the rest of the app must never import Daily directly. Switching providers later should be one new file, not a refactor.
- Define a provider interface, e.g.:
  ```ts
  interface CallProvider {
    createRoom(opts): Promise<{ roomName: string; roomUrl?: string }>;
    mintAccessToken(opts: {
      room: string; identity: string; displayName: string;
      canPublish: boolean; ttlSeconds: number;
    }): Promise<string>;
  }
  ```
  Implement `DailyProvider` now; leave a clear seam for `LiveKitProvider` later. Select via env `CALL_PROVIDER=daily`.

## What to build
**Feature A — Scheduled Orbit calls.** An engagement (`OrbitEvent`) can be an Orbit call that owns its own room. Members click **Join** from the calendar; the call room opens in-app.

**Feature B — Direct calls.** From the Personnel Network (`personnel-hub.tsx`), a member can call a teammate instantly (no scheduling). It rings the callee; they accept/decline.

## Guest join & name capture (must-have)
People with **no OrbitOS account** must be able to join a call by typing their **full name** — no sign-up, no password. Two paths:
1. **Invited guest** (already emailed, has an RSVP link): the `/rsvp/[token]` page gets a **Join call** button when the engagement is an Orbit call. Pre-fill their known name, let them correct it (update `guestNames`), then let them enter.
2. **Walk-in** (link was forwarded, no guest record): a new lightweight page (e.g. `/call/[roomId]/join`) with one field — *Your full name* — that mints a short-lived, room-scoped guest token and drops them into the room. **Recommended:** walk-ins are *ephemeral* — do NOT create a permanent `OrbitGuest` record (the `guests` collection is deliberately the client list; keep it clean). Their name rides on the room's participant list only.

## The "same workspace" rule
Direct calls are only allowed between members who share an `orgId` (this is the "Operational Load Grid"). Reuse the existing `requireCaller` → `caller.orgId` pattern: reject `startCall` unless `caller.orgId === target.orgId`.

## Non-negotiables (match existing architecture)
- **Mint every provider token in a `"use server"` server action on the Admin SDK, never in the browser.** The Daily API key is server-only. This mirrors how `getRsvpContextAction` and the RSVP token signing already work.
- A guest's authority to join a scheduled call flows from the **same signed RSVP token** they already use to reply (`rsvp-token.ts`, format `kind.subjectId.eventId.version.hmac`) — verify it with the existing four gates before minting a call token. Don't add a second guest credential system.
- All Firestore writes go through server actions after an explicit org check, like `events.ts`.
- Validate inputs with zod (`lib/validations`), keep types in `src/types`, follow the existing file/naming conventions and comment style.
- Gate calling by plan tier using the existing billing pattern (`resolveGuestInviteLimit` style) — e.g. free = 1:1 direct calls; paid = group calls, guest join, recording.

## Data model changes
- Extend `OrbitEvent`: `callProvider: "none" | "orbit" | "external"`, `roomId: string | null`, and optional `callActive` / `callStartedAt`. Keep the existing `meetingUrl` working as the `"external"` case. Update `lib/validations/event.ts` and the create/edit dialog (`lib/events/engagement-form.ts` + the dialog component) with a small toggle: **Orbit call / External link / In person**.
- New `calls` collection + `OrbitCall` type (`src/types/call.ts`) for direct calls: `orgId`, `roomId`, `from`, `to`, `status: "ringing" | "active" | "ended" | "declined" | "missed"`, timestamps. The callee's client subscribes with a Firestore listener (same realtime pattern as the activity stream) to show an incoming-call UI.
- Extend `lib/calendar/presence.ts` so an active call (scheduled or direct) surfaces as an "in a call" state on the Personnel Network, alongside the existing calendar-derived presence.
- Add a `match /calls/{id}` block to `firestore.rules`: readable by the org members who are `from`/`to`; server-owned writes only (like the guest fields).

## Suggested file map
- `src/lib/calls/provider.ts` — the `CallProvider` interface + selector
- `src/lib/calls/daily-provider.ts` — Daily implementation (create room, mint meeting token)
- `src/app/actions/calls.ts` — `startCallAction`, `answerCallAction`, `declineCallAction`, `endCallAction`, `getScheduledCallTokenAction`
- `src/app/actions/rsvp.ts` — add a guest "join call" token path beside the existing RSVP gates
- `src/app/call/[roomId]/join/page.tsx` — walk-in name-capture screen
- `src/components/calls/call-room.tsx` — the in-app room (Daily Prebuilt / `@daily-co/daily-react`)
- `src/components/calls/incoming-call.tsx` — ring UI driven by the `calls` listener
- `src/components/dashboard/personnel-hub.tsx` — add a per-row **Call** action, gated by presence (disabled + reason when offline / in a meeting)
- `src/app/rsvp/[token]/page.tsx` — show **Join call** for Orbit-call engagements
- `src/types/event.ts`, `src/types/call.ts`, `src/lib/validations/event.ts`, `firestore.rules` — as above

## Config
- The calling env vars are **already present in `.env.example`**: `CALL_PROVIDER=daily`, `DAILY_API_KEY` (server-only), and `DAILY_DOMAIN`. Read them from there; do not re-add them. `DAILY_API_KEY` must never be exposed to the client — read it only in server code.
- Make sure the same three vars are set in `.env.local` (real values) before running a call.
- Confirm the current Daily SDK package names/versions before installing (`@daily-co/daily-js`, `@daily-co/daily-react`).

## How to proceed
1. **Start with a written plan** and the data-model + interface changes; show it to me before large edits.
2. **Prove one room first:** get two logged-in members into a single hard-coded Daily room (provider + `room-token` action + a bare `call-room.tsx`). This de-risks everything.
3. Then: scheduled Orbit calls → invited-guest join → walk-in join → direct calls (`calls` collection, ring UI, Personnel Network button) → presence + tier gating.
4. Add vitest coverage for the token/gating logic, matching the existing test style (`rsvp-token.test.ts`, `registry.test.ts`).
5. **Do not commit** until I've reviewed. Keep changes provider-agnostic so the eventual LiveKit swap is a single new file.
