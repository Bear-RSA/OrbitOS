"use client";

import { useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { usePreferences } from "@/hooks/use-preferences";
import { useUnreadMessages } from "@/hooks/use-unread-messages";
import { playMessageChime, primeMessageChime } from "@/lib/messages/chime";

/* ------------------------------------------------------------------ */
/*  Message notifier                                                   */
/*                                                                     */
/*  Renders nothing. Mounted once for the whole session, next to       */
/*  `IncomingCall`, for the same reason that one is: a notification    */
/*  that only reaches you on the page you happen to be looking at is   */
/*  not a notification.                                                */
/*                                                                     */
/*  This is the app-wide listener I held back on when the badge was    */
/*  built — a dot on the dashboard was worth its cost only where the   */
/*  dashboard was, but a sound has to follow the person. It is still   */
/*  the same bounded query the Messages page runs, and the Firestore   */
/*  SDK shares one watch stream between identical listeners, so the    */
/*  dashboard's own copy costs nothing extra on top of this.           */
/*                                                                     */
/*  TOWN HALL IS SILENT. It reaches the entire workspace at once, and  */
/*  a notice board that chimes on every desk in the studio is the      */
/*  fastest way to have everyone turn the sound off. Dms and groups —  */
/*  where a message is addressed to you specifically — do chime.       */
/* ------------------------------------------------------------------ */

export function MessageNotifier() {
  const { user } = useAuth();
  const { preferences } = usePreferences();
  const unread = useUnreadMessages(user?.id, user?.orgId);

  /* The newest message this session has already accounted for. A ref
     rather than state: it must not cause a render, and it has to be
     readable inside the effect that updates it. */
  const highWater = useRef<number | null>(null);

  const newest = useMemo(() => {
    const addressed = unread.filter((c) => c.type === "dm" || c.type === "group");
    return addressed.reduce(
      (max, c) => Math.max(max, c.lastMessageAt?.toMillis?.() ?? 0),
      0
    );
  }, [unread]);

  /* Open the audio context on the first real interaction of the session.
     A browser will not let a page start audio it was not asked for, and
     the moment a message lands is not a gesture — so without this, the
     very tab you are watching while you test stays silent. */
  useEffect(() => {
    const prime = () => primeMessageChime();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  /* Reset when the account changes, so signing in as somebody else does
     not inherit the previous person's baseline. */
  useEffect(() => {
    highWater.current = null;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    /* The first snapshot establishes the baseline in silence. Opening
       the app to three-day-old unread messages is not three things
       arriving; it is you turning up. */
    if (highWater.current === null) {
      highWater.current = newest;
      return;
    }

    if (newest > highWater.current) {
      highWater.current = newest;
      if (preferences.messageSounds) playMessageChime();
    }
  }, [newest, user?.id, preferences.messageSounds]);

  return null;
}
