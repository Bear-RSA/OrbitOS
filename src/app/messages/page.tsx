"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { subscribeToMembersByOrg } from "@/lib/queries/members";
import { subscribeToConversation, subscribeToConversations } from "@/lib/queries/messages";
import { townHallConversationId } from "@/lib/messages/conversation-id";
import { getOrCreateDmAction, getOrCreateTownHallAction } from "@/app/actions/messages";
import { MessageThread } from "@/components/messages/message-thread";
import { CreateGroupDialog } from "@/components/messages/create-group-dialog";
import { MemberProfile } from "@/components/members/member-profile";
import {
  ConversationList,
  type ConversationTab,
} from "@/components/messages/conversation-list";
import { Loader } from "@/components/ui/loader";
import { TOWN_HALL_NAME, type Conversation } from "@/types/message";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  Messages                                                           */
/*                                                                     */
/*  Two panes: threads on the left, the open one on the right.         */
/*                                                                     */
/*  This page owns the listeners and the selection; the rail and the   */
/*  thread render what it holds. Keeping selection here is what lets   */
/*  opening a dm from People, and creating a group from the dialog,    */
/*  both end the same way — with that conversation on screen.          */
/* ------------------------------------------------------------------ */

/**
 * `useSearchParams` opts the tree into client-side rendering, which Next
 * requires a Suspense boundary around. The fallback is the same loader
 * the screen shows while the profile resolves, so the boundary is
 * invisible.
 */
export default function MessagesPage() {
  return (
    <Suspense fallback={<OpeningChannels />}>
      <MessagesScreen />
    </Suspense>
  );
}

function OpeningChannels() {
  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-base">
      <Loader />
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
        Opening Channels
      </span>
    </div>
  );
}

function MessagesScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [townHall, setTownHall] = useState<Conversation | null>(null);
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [active, setActive] = useState<Conversation | null>(null);
  const [tab, setTab] = useState<ConversationTab>("chats");
  const [opening, setOpening] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
    else if (!user.orgId) router.push("/dashboard");
  }, [authLoading, user, router]);

  const uid = user?.id;
  const orgId = user?.orgId;

  /* The directory sender names and the People tab are drawn from. Same
     listener the dashboard and the Personnel Network already use. */
  useEffect(() => {
    if (!orgId) return;
    return subscribeToMembersByOrg(orgId, setMembers);
  }, [orgId]);

  /* Town Hall's id is derivable, so the listener opens immediately and
     does not wait on the round trip that materializes the document —
     it simply reports null until the write lands. */
  const townHallId = useMemo(
    () => (orgId ? townHallConversationId(orgId) : null),
    [orgId]
  );

  useEffect(() => {
    if (!townHallId) return;
    return subscribeToConversation(townHallId, setTownHall);
  }, [townHallId]);

  useEffect(() => {
    if (!orgId) return;

    let cancelled = false;
    getOrCreateTownHallAction().then((result) => {
      if (cancelled || result.success) return;
      setError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  /* Dms and groups. Town Hall is not in this query — it has no
     participant list to match on. */
  useEffect(() => {
    if (!uid || !orgId) return;
    return subscribeToConversations(uid, orgId, setThreads);
  }, [uid, orgId]);

  /* `?c=` lets the notification panel hand you the thread it was telling
     you about, rather than dropping you at Town Hall to go find it. An
     id you have no business reading simply fails the rules and leaves
     the pane empty, so this is a convenience, not a way in. */
  const requestedId = searchParams.get("c");

  /* Otherwise Town Hall: it is the one thread everybody has. */
  useEffect(() => {
    if (selectedId) return;
    if (requestedId) setSelectedId(requestedId);
    else if (townHallId) setSelectedId(townHallId);
  }, [selectedId, requestedId, townHallId]);

  /* The open thread is watched by id rather than picked out of the list
     above. A dm opened a moment ago has not reached that query yet —
     the listener has to catch up with the write — and the thread must
     not sit blank while it does. */
  useEffect(() => {
    if (!selectedId) return;
    return subscribeToConversation(selectedId, setActive);
  }, [selectedId]);

  const openDm = useCallback(async (targetUid: string) => {
    setOpening(targetUid);
    setError(null);
    try {
      const result = await getOrCreateDmAction({ targetUid });
      if (result.success) {
        setSelectedId(result.conversationId);
        setTab("chats");
      } else {
        setError(result.error);
      }
    } finally {
      setOpening(null);
    }
  }, []);

  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  /* Owners first, then alphabetical — the same ordering the Personnel
     Network uses, so the two lists read as one workspace. */
  const people = useMemo(
    () =>
      members
        .filter((m) => m.id !== uid)
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
          return a.name.localeCompare(b.name);
        }),
    [members, uid]
  );

  if (authLoading || !user?.orgId) return <OpeningChannels />;

  /* Who is in the room, by name. A count would tell the reader how many
     people can see what they are about to write but not which ones,
     which is the part that changes what gets said. */
  const participantSummary = (conversation: Conversation): string => {
    const names = (conversation.participantIds ?? []).map(
      (id) => liveNames[id] || conversation.participantNames?.[id] || "Unknown operative"
    );
    if (names.length === 0) return "No participants";
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
  };

  const subtitleFor = (conversation: Conversation | null): string | undefined => {
    if (!conversation) return undefined;
    if (conversation.type === "townhall") return "Announcements — owner posts, everyone reads";
    if (conversation.type === "group") return participantSummary(conversation);

    const partnerUid = conversation.participantIds?.find((id) => id !== user.id);
    const partner = partnerUid ? directory.get(partnerUid) : undefined;
    return partner?.roleDescriptor || (partner?.role === "OWNER" ? "Owner" : "Member");
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-base text-ink">
      <header className="shrink-0 border-b border-line/[0.05] bg-base/80 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between tracking-tight">
          <div className="flex items-center gap-3.5">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-surface-control shadow-raised">
              <Image src="/logo.png" alt="" fill className="z-10 rounded-[inherit] object-cover" />
            </div>
            <span className="text-[15px] font-medium tracking-tight text-ink">Messages</span>
          </div>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-2 rounded-lg border border-line/[0.06] bg-surface-control px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-ink-muted transition-colors hover:bg-surface-raised hover:text-ink"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden />
            Dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-4 overflow-hidden px-5 py-5 sm:px-8 lg:px-10">
        <ConversationList
          viewerUid={user.id}
          members={members}
          people={people}
          townHallId={townHallId}
          townHall={townHall}
          threads={threads}
          selectedId={selectedId}
          tab={tab}
          opening={opening}
          onTabChange={setTab}
          onSelect={setSelectedId}
          onOpenDm={(targetUid) => void openDm(targetUid)}
          onOpenProfile={setProfileUid}
          onCreateGroup={() => setCreateGroupOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {error && (
            <p className="mb-3 rounded-lg bg-orbit-red/10 px-4 py-3 font-mono text-[11px] text-orbit-red ring-1 ring-orbit-red/20">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1">
            <MessageThread
              conversation={active}
              viewer={{
                id: user.id,
                name: user.name,
                orgId: user.orgId,
                role: user.role,
                photoURL: user.photoURL,
              }}
              members={members}
              /* Only for the beat before the document arrives. Naming
                 Town Hall unconditionally here would put its title over
                 a dm that is still loading. */
              fallbackTitle={selectedId === townHallId ? TOWN_HALL_NAME : "Conversation"}
              subtitle={subtitleFor(active)}
              onOpenProfile={setProfileUid}
            />
          </div>
        </div>
      </main>

      {/* One card, four ways in: the dm banner, the faces on a group
          header, any avatar in the transcript, and a row in People. */}
      <MemberProfile
        member={profileUid ? (directory.get(profileUid) ?? null) : null}
        onClose={() => setProfileUid(null)}
        viewer={{ id: user.id, orgId: user.orgId }}
        onMessage={(targetUid) => void openDm(targetUid)}
        /* Already in hand from the rail's listener — no second read, and
           no denied get when the two have never spoken. */
        dm={
          profileUid
            ? (threads.find(
                (c) => c.type === "dm" && c.participantIds?.includes(profileUid)
              ) ?? null)
            : null
        }
      />

      <CreateGroupDialog
        open={createGroupOpen}
        onOpenChange={setCreateGroupOpen}
        people={people}
        onCreated={(conversationId) => {
          setSelectedId(conversationId);
          setTab("chats");
        }}
      />
    </div>
  );
}
