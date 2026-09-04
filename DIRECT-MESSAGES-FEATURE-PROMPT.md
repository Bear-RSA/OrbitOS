# OrbitOS — Messages (Direct Messages, Town Hall, Groups): Build Prompt

You are working in the **OrbitOS** codebase (Next.js 15 App Router, TypeScript, Firebase Firestore + Admin SDK, Resend, PayFast billing, Tailwind, zod, vitest). Add an in-app **Messages** module: 1:1 direct messages, a default org-wide **Town Hall** announcements group, and member-created **groups** — the Teams-style messaging surface.

Before writing anything, read these files to ground yourself in the existing conventions — do NOT invent patterns that already exist:
- `src/types/member.ts`, `src/lib/auth/permissions.ts`, `src/lib/auth/session.ts`
- `src/lib/queries/members.ts` (client-listener pattern), `src/lib/queries/calls.ts`
- `src/lib/calls/access.ts` (pure decision functions, split from the actions that gather facts)
- `src/app/actions/calls.ts` (`requireCaller` pattern — resolve the caller from the session cookie, never trust a `uid` argument)
- `src/lib/calls/room-id.ts`, `src/lib/calls/ceiling.ts` (deterministic/opaque ids, hard cost ceilings independent of billing gates)
- `src/hooks/use-activity-stream.ts` and `src/lib/telemetry/stream-guard.ts` — read these for the *cost lesson*, not as the pattern to copy (see "Realtime strategy" below)
- `src/components/dashboard/personnel-hub.tsx`, `src/components/calls/incoming-call.tsx`
- `src/app/dashboard/page.tsx` (sticky header nav — where the Messages button goes)
- `firestore.rules`, `firestore.indexes.json`

**Note:** `src/app/teams/page.tsx` is currently a mocked page (`MOCK_TEAM`, hardcoded avatars) — it is not wired to real member data. Do not treat it as the source of truth for "everyone in the org." The real, live member list is `getMembersByOrg` / `subscribeToMembersByOrg` in `lib/queries/members.ts`, the same one `dashboard/page.tsx` and `personnel-hub.tsx` already use.

## Realtime strategy (important)
This codebase has two realtime patterns already, for two different reasons:
1. **Direct Firestore `onSnapshot` listeners** — narrow, per-user or per-entity queries (`subscribeToMembersByOrg`, `subscribeToIncomingCalls`). Cheap because the query is tightly scoped.
2. **SSE via `/api/telemetry/stream`** — built for one thing: an org/project-wide activity aggregate that got expensive enough to blow through the Spark plan's free tier, so it now runs through a hand-written concurrency + connect-rate guard (`stream-guard.ts`).

**Use pattern 1 for Messages, not 2.** A conversation is exactly the kind of narrow, bounded listener pattern 1 already exists for — one open conversation, one `orderBy("createdAt","desc").limit(N)` query. Building an SSE fan-out for chat would be solving a cost problem this feature doesn't have and duplicating infrastructure that exists for a different shape of problem. Still, bound every message listener with `.limit()` and paginate older history — chat volume over months will dwarf the activity log this guard was built for, so do not leave a query unbounded.

## What to build
**Feature A — Direct messages.** Any member can open a 1:1 conversation with any other member of the same org. No scheduling, no invite — click a name, start typing, same "materialize on first touch" philosophy as call rooms in `lib/calls/room-id.ts`.

**Feature B — Town Hall.** One conversation per org, created automatically (lazily, on first touch — there is no Cloud Functions trigger in this codebase to hook member-creation, so don't add one). Every member of the org can read it. **Only the OWNER role may post** — it is the notices/announcements channel, not a group chat. Members reading-only is the point, not a bug to fix later.

**Feature C — Custom groups.** Any member can create a named group and choose participants from the org directory. Any participant may post (unlike Town Hall). No admin approval needed to create one.

**Left rail:** two sections/tabs —
- **Chats** — Town Hall (pinned, always first), then the member's groups and active DMs, sorted by most recent activity.
- **People** — every member of the org (from `getMembersByOrg`/`subscribeToMembersByOrg`, not the mocked teams page). Clicking a person opens (or creates) the DM with them.

## Data model
New top-level collection `conversations/{conversationId}`, with a `messages` subcollection.

```ts
interface Conversation {
  id: string;
  orgId: string;
  type: "dm" | "group" | "townhall";
  name: string | null;              // null for dm; required for group/townhall
  participantIds: string[];         // dm/group only — see Town Hall note below
  participantNames: Record<string, string>; // denormalized at creation, same contract as guestNames on OrbitEvent — render the left rail without a join
  createdBy: string;
  createdAt: Timestamp;
  lastMessageAt: Timestamp | null;
  lastMessagePreview: string | null;  // denormalized so the left rail never reads the messages subcollection just to render itself
  lastMessageBy: string | null;
  lastReadAt: Record<string, Timestamp>; // per-participant, keyed by uid — drives the unread indicator
}

interface Message {
  id: string;
  senderId: string;
  createdAt: Timestamp;
  text: string;                     // MVP is text-only; attachments are a follow-up (Cloudinary pipeline already exists in lib/cloudinary.ts)
  editedAt: Timestamp | null;
  deletedAt: Timestamp | null;       // soft delete — same reasoning as cancelled engagements: keep the record, don't remove it
}
```

**Deliberately not denormalizing `senderName` onto `Message`.** Unlike `fromName`/`toName` on a call — where the name is shown *before* the callee has any other context — a message renders inside a conversation the client is already subscribed to, so the sender's display name is resolved client-side from the already-loaded member list (`getMembersByOrg`). Storing a name on every message would let a member write an arbitrary display name onto their own messages with no rule able to catch it cheaply; not storing it removes the vector instead of policing it.

**Town Hall does not use `participantIds`.** Membership is "everyone currently in the org," which changes as people join and leave — keeping an array in sync would need a write on every invite acceptance and every removal, and this codebase has no Cloud Functions to hook that. Instead, Town Hall access is derived the same way `tasks`/`events` already are: `isMember(orgId)` / `isOwner(orgId)` in `firestore.rules`, checked against the live `users/{uid}` doc, not a stored list. The left rail shows Town Hall unconditionally for any signed-in member (subscribe directly to the deterministic id below) rather than folding it into the `participantIds array-contains uid` query used for DMs and groups.

**Deterministic ids, same reasoning as `lib/calls/room-id.ts` (get-or-create, not create):**
- Town Hall: `townhall_{orgId}` — one per org, materialized on first read/write.
- DM: `dm_{orgId}_{sortedUid1}_{sortedUid2}` — prevents two clients racing to create duplicate threads for the same pair, and makes "open my DM with X" idempotent.
- Group: a random id (like a project or task) — multiple groups between the same people are legitimate.

## Non-negotiables (match existing architecture)
- **Conversation creation is a server action**, resolving the caller from the session cookie via `requireServerUid()`/`requireCaller()` — never a client-supplied uid. This is where cross-user facts get validated (target is in the same org, participant list de-duped, no self-DM) — the same reason `startCallAction` exists instead of a raw client `addDoc`.
- **Sending a message is a direct client Firestore write** (`lib/queries/messages.ts`, same shape as `lib/queries/members.ts`), not a server action. A message is ordinary org-scoped data like a task, not a capability like a room id or a guest email — round-tripping every keystroke's send through a server action buys nothing here and costs latency. Gate it in `firestore.rules` instead (participant check for dm/group, `isOwner(orgId)` for townhall).
- **Split pure access decisions from the actions that gather facts**, same as `lib/calls/access.ts`. Put `canPostToConversation(facts): JoinDecision`-shaped logic in `lib/messages/access.ts` so it's testable without touching Firestore, and so the client-side "why is my composer disabled" state and the server-side rule are provably checking the same thing.
- **The org boundary is the same one everything else uses**: `caller.orgId === target.orgId`, reusing the `requireCaller` shape from `app/actions/calls.ts`.
- Validate inputs with zod in `lib/validations/messages.ts` (group name length, message text length/non-empty, participant array bounds), following `lib/validations/call.ts`'s split: shapes only here, cross-entity checks (same org, tier limits) in the action.
- Bound every message listener with `.limit()` (recommend 50, paginate older history on scroll-up) — see "Realtime strategy" above.

## Firestore rules
Add alongside the existing `match /calls/{callId}` block, following its comment style:

```
match /conversations/{conversationId} {
  allow read: if isSignedIn() && (
    resource.data.type == 'townhall'
      ? isInOrg(resource.data.orgId)
      : (isInOrg(resource.data.orgId) && request.auth.uid in resource.data.participantIds)
  );

  // Creation is server-only (Admin SDK) — see "Non-negotiables" above.
  allow create: if false;

  // A participant may only touch the fields their own read of the
  // conversation is responsible for: their own lastReadAt entry, and the
  // denormalized "what happened last" trio that every send has to keep
  // current. Nothing here can add or remove a participant, rename the
  // conversation, or touch postScope-equivalent state — that stays
  // server-owned the same way callActive and roomId do on events.
  allow update: if isSignedIn()
    && isInOrg(resource.data.orgId)
    && (resource.data.type == 'townhall' || request.auth.uid in resource.data.participantIds)
    && editedKeys().hasOnly(['lastMessageAt', 'lastMessagePreview', 'lastMessageBy', 'lastReadAt']);

  match /messages/{messageId} {
    function conversation() {
      return get(/databases/$(database)/documents/conversations/$(conversationId)).data;
    }

    allow read: if isSignedIn() && (
      conversation().type == 'townhall'
        ? isInOrg(conversation().orgId)
        : (isInOrg(conversation().orgId) && request.auth.uid in conversation().participantIds)
    );

    allow create: if isSignedIn()
      && request.resource.data.senderId == request.auth.uid
      && (
        conversation().type == 'townhall'
          ? isOwner(conversation().orgId)
          : (isInOrg(conversation().orgId) && request.auth.uid in conversation().participantIds)
      );

    // Editing/soft-deleting your own message only.
    allow update: if isSignedIn()
      && resource.data.senderId == request.auth.uid
      && editedKeys().hasOnly(['text', 'editedAt', 'deletedAt']);
  }
}
```

Double-check the `get()` cost here against how `projects/{projectId}/files/{fileId}` already does the same parent-lookup pattern — it's precedent, not a new idea.

## Suggested file map
- `src/types/message.ts` — `Conversation`, `Message`, `ConversationType`
- `src/lib/validations/messages.ts` — group name / message text / participant-array schemas
- `src/lib/messages/access.ts` — `canPostToConversation`, `canCreateGroup` as pure functions over plain facts, mirroring `lib/calls/access.ts`
- `src/lib/messages/conversation-id.ts` — `dmConversationId(orgId, uidA, uidB)`, `townHallConversationId(orgId)`, mirroring `lib/calls/room-id.ts`
- `src/app/actions/messages.ts` — `getOrCreateDmAction`, `getOrCreateTownHallAction`, `createGroupAction` (`requireCaller` pattern from `app/actions/calls.ts`)
- `src/lib/queries/messages.ts` — `subscribeToConversations(uid, orgId, cb)`, `subscribeToMessages(conversationId, cb)`, `sendMessage(...)` (direct client write), mirroring `lib/queries/members.ts`
- `src/app/messages/page.tsx` — the two-pane screen (left rail: Chats/People, right: thread)
- `src/components/messages/conversation-list.tsx` — left rail
- `src/components/messages/message-thread.tsx` — header + scrollback + composer; composer hidden/disabled with an explanatory line ("Only the owner can post in Town Hall") when `canPostToConversation` says no — same "disabled, and says why" philosophy as the Call button in `personnel-hub.tsx`
- `src/components/messages/create-group-dialog.tsx` — name + multi-select participants, mirroring `components/members/add-member-dialog.tsx`
- `src/app/dashboard/page.tsx` — add a **Messages** `ActionButton` (a `MessageSquare` icon, `lucide-react` is already a dependency) next to Refresh/Create Project in the sticky header, routing to `/messages`
- `firestore.rules`, `firestore.indexes.json` — as above; add a composite index on `conversations`: `participantIds` (array-contains) + `lastMessageAt` (desc) for the left rail's DM/group query

## Config
No new environment variables or providers — this rides entirely on the Firebase project already configured. Nothing to add to `.env.example`.

## How to proceed
1. **Start with a written plan** and the data-model + rules changes; show it to me before large edits.
2. Build Town Hall first — it's the simplest case (no participant management, one conversation per org) and proves the read/write split in `firestore.rules` before DMs or groups add participant lists on top.
3. Then DMs: `getOrCreateDmAction`, `lib/queries/messages.ts`, the thread UI.
4. Then groups: `createGroupAction`, the create-group dialog, participant list rendering.
5. Wire the left rail (`conversation-list.tsx`) once all three conversation types exist, and add the Messages button to the dashboard header last.
6. Add vitest coverage for `lib/messages/access.ts` and the conversation-id helpers, matching `access.test.ts` / `room-id.test.ts`.
7. **Do not commit** until I've reviewed.
