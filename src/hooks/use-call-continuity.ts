"use client";

import { useEffect, useRef } from "react";
import type { DailyCall } from "@daily-co/daily-js";
import {
  announceCall,
  holdScreenAwake,
  keepAudioSessionAlive,
  parkCameraWhileHidden,
} from "@/lib/calls/background";

/* ------------------------------------------------------------------ */
/*  Call continuity                                                    */
/*                                                                     */
/*  Everything that keeps a call running while the person on it is     */
/*  doing something else — locking their phone, switching tabs,        */
/*  walking to another page of the app — gathered into one mount so    */
/*  the room component does not have to remember four separate         */
/*  lifecycles. See `lib/calls/background` for what each measure is    */
/*  actually doing and why none of them is allowed to fail loudly.     */
/*                                                                     */
/*  Mounted by the shell rather than by the room, so it covers the     */
/*  stretch where the room is still opening. A phone that locks during */
/*  "Connecting" should come back to a call, not to a dead page.       */
/* ------------------------------------------------------------------ */

interface CallContinuityOptions {
  /** The live provider handle, once there is one. */
  frame: DailyCall | null;
  /** What the OS shows on the lock screen. */
  title: string;
  /** What the lock screen's stop button does. */
  onHangUp: () => void;
}

export function useCallContinuity({ frame, title, onHangUp }: CallContinuityOptions) {
  /* Held in a ref so a fresh callback on every render does not re-register
     the OS handlers — which on some browsers flickers the lock screen. */
  const hangUpRef = useRef(onHangUp);
  hangUpRef.current = onHangUp;

  /* These two run for the whole life of the call and care about nothing
     else, so they mount once and are released once. */
  useEffect(() => holdScreenAwake(), []);
  useEffect(() => keepAudioSessionAlive(), []);

  useEffect(() => announceCall(title, () => hangUpRef.current()), [title]);

  useEffect(() => {
    if (!frame) return;
    return parkCameraWhileHidden(frame);
  }, [frame]);
}
