/* ------------------------------------------------------------------ */
/*  Delivered and Read                                                 */
/*                                                                     */
/*  Under the last message you sent: did it reach them, and have they  */
/*  read it?                                                           */
/*                                                                     */
/*    Sent       saved, but nobody else's OrbitOS has picked it up     */
/*    Delivered  it reached their OrbitOS: an open tab on any device   */
/*               saw it (`lastDeliveredAt`)                            */
/*    Read       they opened the thread after it (`lastReadAt`)        */
/*                                                                     */
/*  Read always counts as delivered. In a group it says how many of    */
/*  the others it has reached or been read by. Town Hall shows none:   */
/*  a notice board isn't a conversation with read receipts.            */
/* ------------------------------------------------------------------ */

export type ReceiptState = "sending" | "sent" | "delivered" | "read";

export interface Receipt {
  state: ReceiptState;
  /** What to show, e.g. "Read", "Delivered to 2 of 3". */
  label: string;
}

export function receiptFor(params: {
  type: "dm" | "group" | "townhall";
  senderId: string;
  /** Null while the server timestamp is still on its way. */
  sentAtMs: number | null;
  participantIds: readonly string[];
  /** uid → millis they last read the thread. */
  lastReadAt: Readonly<Record<string, number | null | undefined>>;
  /** uid → millis their OrbitOS last received the thread's newest message. */
  lastDeliveredAt: Readonly<Record<string, number | null | undefined>>;
}): Receipt | null {
  const { type, senderId, sentAtMs, participantIds, lastReadAt, lastDeliveredAt } = params;
  if (type === "townhall") return null;
  if (sentAtMs === null) return { state: "sending", label: "Sending…" };

  const others = participantIds.filter((uid) => uid !== senderId);
  if (others.length === 0) return { state: "sent", label: "Sent" };

  const read = others.filter((uid) => (lastReadAt[uid] ?? 0) >= sentAtMs).length;
  const delivered = others.filter(
    (uid) => Math.max(lastReadAt[uid] ?? 0, lastDeliveredAt[uid] ?? 0) >= sentAtMs
  ).length;
  const of = others.length;

  if (type === "dm" || of === 1) {
    if (read > 0) return { state: "read", label: "Read" };
    if (delivered > 0) return { state: "delivered", label: "Delivered" };
    return { state: "sent", label: "Sent" };
  }

  if (read === of) return { state: "read", label: "Read by everyone" };
  if (read > 0) return { state: "read", label: `Read by ${read} of ${of}` };
  if (delivered === of) return { state: "delivered", label: "Delivered" };
  if (delivered > 0) return { state: "delivered", label: `Delivered to ${delivered} of ${of}` };
  return { state: "sent", label: "Sent" };
}
