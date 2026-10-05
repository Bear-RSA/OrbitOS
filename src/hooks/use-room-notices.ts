"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DailyCall, DailyEventObject } from "@daily-co/daily-js";
import { usePreferences } from "@/hooks/use-preferences";
import {
  emptyRoster,
  NOTICE_TTL_MS,
  noteArrival,
  noteDeparture,
  noticeText,
  pruneNotices,
  readChatMessage,
  settleRoster,
  UNNAMED_PARTICIPANT,
  type RoomNotice,
  type RoomNoticeKind,
} from "@/lib/calls/room-notices";
import { playMessageChime } from "@/lib/messages/chime";
import {
  notificationAccess,
  shouldNotify,
  showDesktopNotification,
} from "@/lib/notifications/desktop";

/* ------------------------------------------------------------------ */
/*  Room notices                                                       */
/*                                                                     */
/*  Listens to the room for the three things worth interrupting        */
/*  somebody over — an arrival, a departure, a chat line — and hands   */
/*  back a short list for the shell to paint. Each notice withdraws    */
/*  itself after a few seconds; the list is never something the reader */
/*  has to clear.                                                      */
/*                                                                     */
/*  Two other channels ride on the same events. A chat line chimes,    */
/*  the way a message anywhere else in the app does, under the same    */
/*  preference. And when the tab is not the one being looked at, each  */
/*  notice is also raised as a desktop notification — the in-app card  */
/*  is painted on a tab nobody is watching, which is the whole case    */
/*  `lib/notifications/desktop` exists for.                            */
/*                                                                     */
/*  The roster in `lib/calls/room-notices` is what keeps this quiet on */
/*  entry. See the note at the top of that file.                       */
/* ------------------------------------------------------------------ */

interface RoomNoticeOptions {
  /** The live provider handle, once there is one. */
  frame: DailyCall | null;
  /**
   * What the call is called, for the desktop card's title, and the key
   * the cards collapse under. Absent until the room opens.
   */
  roomId: string | null;
  title: string;
}

/** Long enough to be read, short enough not to become wallpaper. */
const DESKTOP_CARD_MS = 8_000;

let noticeSerial = 0;

export function useRoomNotices({ frame, roomId, title }: RoomNoticeOptions): RoomNotice[] {
  const { preferences } = usePreferences();
  const [notices, setNotices] = useState<RoomNotice[]>([]);

  /* Read inside event handlers that are registered once per frame, so
     they see the current values without re-subscribing on every
     preference write. */
  const prefsRef = useRef(preferences);
  prefsRef.current = preferences;
  const titleRef = useRef(title);
  titleRef.current = title;
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  const raise = useCallback((kind: RoomNoticeKind, name: string, text?: string) => {
    const notice: RoomNotice = {
      id: `${Date.now()}-${++noticeSerial}`,
      kind,
      name,
      text,
      at: Date.now(),
    };
    setNotices((prev) => pruneNotices([...prev, notice], notice.at));

    /* A chat line is a message, and gets the sound a message gets. An
       arrival does not: people come and go throughout a long meeting,
       and a chime for each is the fastest way to have the sound turned
       off for the lines that matter. */
    if (kind === "chat" && prefsRef.current.messageSounds) playMessageChime();

    if (
      !shouldNotify({
        access: notificationAccess(),
        enabled: prefsRef.current.desktopNotifications,
        visible: document.visibilityState === "visible",
      })
    ) {
      return;
    }

    const room = roomIdRef.current ?? "room";
    const close = showDesktopNotification({
      title: kind === "chat" ? `${name} · ${titleRef.current}` : titleRef.current,
      body: kind === "chat" ? (text ?? "") : noticeText(notice),
      /* One card per kind per room. Three arrivals in a row become one
         card naming the latest, which is the right amount of news. */
      tag: `orbit-room-${room}-${kind === "chat" ? "chat" : "presence"}`,
      transient: true,
    });
    /* The OS may keep a transient card longer than we would; a card
       about somebody who joined a minute ago is stale, so it is
       withdrawn on our schedule rather than the OS's. */
    setTimeout(close, DESKTOP_CARD_MS);
  }, []);

  useEffect(() => {
    if (!frame) return;

    let roster = emptyRoster();

    const nameOf = (participant: { user_name?: string } | undefined): string =>
      participant?.user_name?.trim() || UNNAMED_PARTICIPANT;

    /* Everyone here at the moment of joining is taken as read. */
    const settle = () => {
      let ids: string[] = [];
      try {
        ids = Object.values(frame.participants()).map((p) => p.session_id);
      } catch {
        /* Asked of a frame that is already gone. Nothing to settle. */
      }
      roster = settleRoster(roster, ids);
    };

    const onJoined = () => settle();

    const onArrival = (ev: DailyEventObject<"participant-joined"> | undefined) => {
      const p = ev?.participant;
      if (!p || p.local) return;
      if (noteArrival(roster, p.session_id)) raise("joined", nameOf(p));
    };

    const onDeparture = (ev: DailyEventObject<"participant-left"> | undefined) => {
      const p = ev?.participant;
      if (!p || p.local) return;
      /* `hidden` is the provider paging a large call, not a person
         leaving it. */
      if (ev?.reason === "hidden") return;
      if (noteDeparture(roster, p.session_id)) raise("left", nameOf(p));
    };

    const onAppMessage = (ev: DailyEventObject<"app-message"> | undefined) => {
      const chat = readChatMessage(ev?.data);
      if (!chat) return;

      let name = chat.name;
      if (!name) {
        try {
          name = nameOf(frame.participants()[ev?.fromId ?? ""]);
        } catch {
          name = UNNAMED_PARTICIPANT;
        }
      }
      raise("chat", name, chat.message);
    };

    frame.on("joined-meeting", onJoined);
    frame.on("participant-joined", onArrival);
    frame.on("participant-left", onDeparture);
    frame.on("app-message", onAppMessage);

    /* The handle is published on `loaded`, before the join — but also,
       as a fallback, after `join()` resolves, by which time the meeting
       has been joined and the event above has already fired. */
    try {
      if (frame.meetingState() === "joined-meeting") settle();
    } catch {
      /* Not yet, then. The event will say so. */
    }

    return () => {
      frame.off("joined-meeting", onJoined);
      frame.off("participant-joined", onArrival);
      frame.off("participant-left", onDeparture);
      frame.off("app-message", onAppMessage);
    };
  }, [frame, raise]);

  /* Withdraw what has expired. Runs only while there is something to
     withdraw, so an idle room costs no timer at all. */
  useEffect(() => {
    if (notices.length === 0) return;

    const oldest = notices[0].at;
    const wait = Math.max(0, oldest + NOTICE_TTL_MS - Date.now());
    const timer = setTimeout(() => {
      setNotices((prev) => pruneNotices(prev, Date.now()));
    }, wait);

    return () => clearTimeout(timer);
  }, [notices]);

  /* A new room starts clean. */
  useEffect(() => {
    setNotices([]);
  }, [frame]);

  return notices;
}
