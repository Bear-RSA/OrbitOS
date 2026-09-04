"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeToConversation, subscribeToConversations } from "@/lib/queries/messages";
import { townHallConversationId } from "@/lib/messages/conversation-id";
import { conversationUnread } from "@/lib/messages/summary";
import type { Conversation } from "@/types/message";

/* ------------------------------------------------------------------ */
/*  Unread messages                                                    */
/*                                                                     */
/*  What is waiting for this person, newest first — not just whether   */
/*  anything is. A badge that only says "something happened" makes the */
/*  reader open Messages to find out what, which is the trip the badge */
/*  was supposed to save them.                                         */
/*                                                                     */
/*  TWO listeners, because Town Hall is not in the dm/group query: it  */
/*  has no `participantIds` to match on, so it is watched by its       */
/*  derived id the same way the Messages page watches it. An owner     */
/*  posting a notice has to reach the whole workspace, which is most   */
/*  of the point of the channel.                                       */
/*                                                                     */
/*  Both are bounded, and both are the same queries the Messages page  */
/*  already runs — this adds no new shape of read. It is deliberately  */
/*  NOT mounted app-wide in `layout.tsx` the way `IncomingCall` is: a  */
/*  ring has to interrupt whatever you are doing, a message does not,  */
/*  and an open listener on every route for every signed-in client is  */
/*  a cost this answer does not justify.                               */
/* ------------------------------------------------------------------ */

export function useUnreadMessages(
  uid: string | undefined,
  orgId: string | undefined
): Conversation[] {
  const [threads, setThreads] = useState<Conversation[]>([]);
  const [townHall, setTownHall] = useState<Conversation | null>(null);

  const townHallId = useMemo(
    () => (orgId ? townHallConversationId(orgId) : null),
    [orgId]
  );

  useEffect(() => {
    if (!uid || !orgId) return;
    return subscribeToConversations(uid, orgId, setThreads);
  }, [uid, orgId]);

  useEffect(() => {
    if (!townHallId) return;
    return subscribeToConversation(townHallId, setTownHall);
  }, [townHallId]);

  return useMemo(() => {
    if (!uid) return [];

    const candidates = townHall ? [townHall, ...threads] : threads;

    return candidates
      .filter((conversation) => conversationUnread(conversation, uid))
      .sort(
        (a, b) =>
          (b.lastMessageAt?.toMillis?.() ?? 0) - (a.lastMessageAt?.toMillis?.() ?? 0)
      );
  }, [threads, townHall, uid]);
}
