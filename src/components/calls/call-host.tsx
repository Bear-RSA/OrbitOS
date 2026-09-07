"use client";

import { useCall } from "@/contexts/call-context";
import { GroupCall } from "@/components/calls/group-call";
import { IncomingCall } from "@/components/calls/incoming-call";
import { OutgoingCall } from "@/components/calls/outgoing-call";
import { TranscriptOutcome } from "@/components/calls/transcript-outcome";

/* ------------------------------------------------------------------ */
/*  Call host                                                          */
/*                                                                     */
/*  Every call surface, mounted once from the root layout. There is    */
/*  nothing else in this file on purpose: it exists so the components  */
/*  can read `contexts/call-context` without the context having to     */
/*  import them back.                                                  */
/*                                                                     */
/*  Mounting here is the whole feature. The root layout is the one     */
/*  part of the tree the App Router does not tear down between pages,  */
/*  so a call started on Messages is still running on Projects, on the */
/*  dashboard, and on a member's profile card. Nothing about that is   */
/*  visible in the surfaces themselves — they were already written to  */
/*  clean up on unmount, and the change is that unmounting is now      */
/*  something only hanging up does.                                    */
/* ------------------------------------------------------------------ */

export function CallHost() {
  const { outgoing, group, endOutgoing, endGroup, lastTranscript, noteTranscript } =
    useCall();

  return (
    <>
      {/* A phone that only rings on the page you happen to be looking
          at is not a phone. Renders nothing until somebody calls. */}
      <IncomingCall />

      {outgoing && <OutgoingCall target={outgoing} onClose={endOutgoing} />}

      {group && (
        <GroupCall
          conversationId={group.conversationId}
          title={group.title}
          onClose={endGroup}
        />
      )}

      {/* Mounted here rather than inside a call surface because its whole
          job is to still be on screen once that surface has gone. */}
      {lastTranscript && (
        <TranscriptOutcome
          roomId={lastTranscript.roomId}
          title={lastTranscript.title}
          onClose={() => noteTranscript(null)}
        />
      )}
    </>
  );
}
