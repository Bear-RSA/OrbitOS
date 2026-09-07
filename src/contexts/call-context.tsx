"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { DailyCall } from "@daily-co/daily-js";

/* ------------------------------------------------------------------ */
/*  Call session                                                       */
/*                                                                     */
/*  WHERE A CALL LIVES, which until now was wherever it happened to be */
/*  started. A ring placed from the Personnel Network was a piece of   */
/*  state inside that grid; a group room was a piece of state on the   */
/*  Messages page. Both die the moment their page unmounts, and in the */
/*  App Router that is every navigation — so clicking Projects while   */
/*  talking to someone tore the iframe down and dropped the call.      */
/*                                                                     */
/*  So the state moved up here, and `CallHost` renders the surfaces    */
/*  from the root layout, which survives client-side navigation. Pages */
/*  now ASK for a call instead of holding one: `callPerson`,           */
/*  `joinGroupCall`. What they get back is nothing — no component to   */
/*  mount, nothing to clean up, and no way for a route change to end a */
/*  conversation.                                                      */
/*                                                                     */
/*  This file deliberately imports none of the call components. The    */
/*  host does that, one level down, which is what lets `CallRoom`      */
/*  reach back into this context without a cycle.                      */
/* ------------------------------------------------------------------ */

export interface CallTarget {
  uid: string;
  name: string;
  photoURL?: string | null;
}

export interface GroupRoom {
  conversationId: string;
  title: string;
}

/**
 * A transcript that outlived the call it came from.
 *
 * Held here rather than inside the call surfaces because the point of it
 * is to still be on screen after those have unmounted — the room is
 * gone, and the thing it produced is what the person wanted.
 */
export interface FinishedTranscript {
  roomId: string;
  title: string;
}

interface CallContextValue {
  /** Who is being rung, if anyone. */
  outgoing: CallTarget | null;
  /** The group room this person is sitting in, if any. */
  group: GroupRoom | null;
  /**
   * The live provider handle, published by `CallRoom` while a room is
   * open. The shell needs it for the controls it paints itself, and the
   * continuity hook needs it to park the camera when a phone locks.
   */
  frame: DailyCall | null;
  /** True while any ring or room is up. One call at a time. */
  engaged: boolean;
  /** The room is parked in the corner rather than filling the screen. */
  minimized: boolean;
  /** The last call that produced a transcript, until it is dismissed. */
  lastTranscript: FinishedTranscript | null;

  callPerson: (target: CallTarget) => void;
  joinGroupCall: (conversationId: string, title: string) => void;
  endOutgoing: () => void;
  endGroup: () => void;
  minimize: () => void;
  expand: () => void;
  registerFrame: (frame: DailyCall | null) => void;
  noteTranscript: (transcript: FinishedTranscript | null) => void;
}

const noop = () => {};

/* A default that works rather than throws. `CallRoom` is also mounted by
   /call/proof, and a diagnostics page is a poor place to discover that a
   provider is missing. */
const CallContext = createContext<CallContextValue>({
  outgoing: null,
  group: null,
  frame: null,
  engaged: false,
  minimized: false,
  lastTranscript: null,
  callPerson: noop,
  joinGroupCall: noop,
  endOutgoing: noop,
  endGroup: noop,
  minimize: noop,
  expand: noop,
  registerFrame: noop,
  noteTranscript: noop,
});

export function CallProvider({ children }: { children: React.ReactNode }) {
  const [outgoing, setOutgoing] = useState<CallTarget | null>(null);
  const [group, setGroup] = useState<GroupRoom | null>(null);
  const [frame, setFrame] = useState<DailyCall | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [lastTranscript, setLastTranscript] = useState<FinishedTranscript | null>(null);

  /* An answered incoming call has no entry above — `IncomingCall` owns
     its own ring and grant — but it does publish a frame, so a room is
     open whenever any of the three is true. */
  const engaged = Boolean(outgoing || group || frame);

  const callPerson = useCallback(
    (target: CallTarget) => {
      /* Placing a second call over a live one has no meaning, and the
         provider refuses a second frame anyway. Better to ignore the
         click than to tear down the conversation it interrupts. */
      if (outgoing || group || frame) return;
      setMinimized(false);
      setLastTranscript(null);
      setOutgoing(target);
    },
    [outgoing, group, frame]
  );

  const joinGroupCall = useCallback(
    (conversationId: string, title: string) => {
      /* Walking into the room you are already in is a no-op, not a
         rejoin: remounting would destroy the iframe and re-ask for the
         microphone. */
      if (group?.conversationId === conversationId) {
        setMinimized(false);
        return;
      }
      if (outgoing || group || frame) return;
      setMinimized(false);
      setLastTranscript(null);
      setGroup({ conversationId, title });
    },
    [outgoing, group, frame]
  );

  const endOutgoing = useCallback(() => {
    setOutgoing(null);
    setMinimized(false);
  }, []);

  const endGroup = useCallback(() => {
    setGroup(null);
    setMinimized(false);
  }, []);

  /* Set by the call shell on its way out, cleared when the card is
     dismissed or when the next call starts — a card offering the last
     meeting's transcript over a live room is in the way, and there is
     only ever one call. */
  const noteTranscript = useCallback((next: FinishedTranscript | null) => {
    setLastTranscript(next);
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => setMinimized(false), []);

  const registerFrame = useCallback((next: DailyCall | null) => {
    setFrame(next);
    /* A room that just closed leaves nothing to restore, and the next
       one should open at full size however the last one was left. */
    if (!next) setMinimized(false);
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      outgoing,
      group,
      frame,
      engaged,
      minimized,
      lastTranscript,
      callPerson,
      joinGroupCall,
      endOutgoing,
      endGroup,
      minimize,
      expand,
      registerFrame,
      noteTranscript,
    }),
    [
      outgoing,
      group,
      frame,
      engaged,
      minimized,
      lastTranscript,
      callPerson,
      joinGroupCall,
      endOutgoing,
      endGroup,
      minimize,
      expand,
      registerFrame,
      noteTranscript,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall(): CallContextValue {
  return useContext(CallContext);
}
