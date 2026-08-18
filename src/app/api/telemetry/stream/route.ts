import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getServerSession } from "@/lib/auth/session";
import { verifyProjectAccess, resolveLiveStreamLimit } from "@/lib/auth/permissions";
import { admitStream, getProjectEventTotal } from "@/lib/telemetry/stream-guard";

/* ------------------------------------------------------------------ */
/*  SSE Telemetry Stream                                               */
/*                                                                     */
/*  GET /api/telemetry/stream?projectId=xxx                            */
/*                                                                     */
/*  The `activity` collection is deny-all in firestore.rules, so this  */
/*  route — running the Admin SDK, which bypasses rules entirely — is  */
/*  the ONLY read path into it. That makes this handler the security   */
/*  boundary for the whole telemetry log, not a convenience proxy:     */
/*  middleware deliberately skips /api/* on the understanding that     */
/*  each route authenticates itself, so the session check and the      */
/*  project-membership check below are what stand between a guessed    */
/*  projectId and another workspace's invitee emails and file names.   */
/*                                                                     */
/*  Wire protocol (one JSON object per `data:` frame):                 */
/*    { type: "ready",    projectId, total }   once, on connect        */
/*    { type: "snapshot", events }             once, the initial window*/
/*    { type: "append",   events, total }      per change, deltas only */
/*    { type: "error",    message }            listener failure        */
/*  plus `: hb` comment frames as keep-alive.                          */
/*                                                                     */
/*  Admission is also a COST boundary, not only a security one. Every  */
/*  accepted connection buys WINDOW_SIZE document reads before it       */
/*  delivers anything live, so `lib/telemetry/stream-guard` caps how    */
/*  many streams a caller may hold and how often they may open one.     */
/*  A refused caller gets 429 + Retry-After and touches Firestore not   */
/*  at all — EventSource cannot read that status, but it retries on     */
/*  backoff and the rejection stays free.                               */
/* ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
// Firestore listeners need the Node runtime; the Edge runtime cannot host
// firebase-admin, and a long-lived listener is the entire point here.
export const runtime = "nodejs";

/** How many past events a newly connected client receives. */
const WINDOW_SIZE = 60;

/**
 * Proxies (Vercel, nginx, Cloudflare) close an idle response well before a
 * quiet project produces its next event. Without this the connection dies,
 * the client reconnects, and every cycle allocates a fresh Firestore
 * listener — a reconnect loop that reads the collection forever.
 */
const HEARTBEAT_MS = 20_000;

interface WireEvent {
  id: string;
  eventType: string;
  projectId: string | null;
  orgId: string;
  actor: { uid: string; name: string };
  metadata: Record<string, unknown>;
  timestamp: string | null;
}

function toWireEvent(doc: FirebaseFirestore.QueryDocumentSnapshot): WireEvent {
  const data = doc.data();
  return {
    id: doc.id,
    eventType: data.eventType,
    projectId: data.projectId ?? null,
    orgId: data.orgId,
    actor: data.actor ?? { uid: "system", name: "System" },
    metadata: data.metadata ?? {},
    // Firestore Timestamp -> ISO string so it survives JSON.
    timestamp: data.timestamp?.toDate?.()?.toISOString() ?? data.timestamp ?? null,
  };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return new Response("Missing projectId", { status: 400 });
  }

  const session = await getServerSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const access = await verifyProjectAccess(session.uid, projectId);
  if (!access.hasAccess) {
    // Deliberately uniform: distinguishing "no such project" from "not your
    // project" would let a caller enumerate project IDs.
    return new Response("Forbidden", { status: 403 });
  }

  // Cost gate. Comes AFTER authorization so an unauthenticated flood cannot
  // consume a legitimate user's allowance, and BEFORE the stream is built so
  // a refused caller costs nothing in Firestore reads — which is what makes a
  // rejected reconnect loop harmless rather than merely slower.
  const admission = admitStream({
    uid: session.uid,
    projectId,
    tierLimit: await resolveLiveStreamLimit(access.orgId ?? ""),
  });

  if (!admission.admitted) {
    return new Response(admission.reason, {
      status: 429,
      headers: {
        "Retry-After": String(admission.retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    });
  }

  const encoder = new TextEncoder();

  // Hoisted so `cancel` can reach the teardown that `start` builds.
  let teardownRef: (() => void) | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | null = null;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let isFirstSnapshot = true;
      // Running total of events ever logged for this project. Seeded from an
      // aggregate count so the UI can show a real figure rather than the
      // size of the display window, which is capped and never grows.
      let total = 0;

      const teardown = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (unsubscribe) unsubscribe();
        heartbeat = null;
        unsubscribe = null;
        // Must run on every exit path — error, abort and cancel all land here.
        // A missed release leaks the slot for the life of the instance and
        // locks the user out of their own feed.
        admission.release();
      };
      teardownRef = teardown;

      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Client vanished mid-write. Stop the listener rather than letting
          // it keep firing against a dead controller for the pod's lifetime.
          teardown();
        }
      };

      const query = adminDb
        .collection("activity")
        .where("projectId", "==", projectId)
        .orderBy("timestamp", "desc")
        .limit(WINDOW_SIZE);

      // Cached per project: the aggregate is billed, and re-running it on
      // every connect meant a reconnecting client paid for a number that
      // barely moves. See getProjectEventTotal for the staleness trade.
      total = await getProjectEventTotal(projectId);

      send({ type: "ready", projectId, total });

      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          // A comment frame: keeps the socket warm without the client
          // needing to parse or ignore a synthetic event.
          controller.enqueue(encoder.encode(`: hb\n\n`));
        } catch {
          teardown();
        }
      }, HEARTBEAT_MS);

      unsubscribe = query.onSnapshot(
        (snapshot) => {
          if (closed) return;

          if (isFirstSnapshot) {
            isFirstSnapshot = false;
            // Already ordered newest-first by the query.
            send({ type: "snapshot", events: snapshot.docs.map(toWireEvent) });
            return;
          }

          // Deltas only. The previous implementation re-sent the entire
          // window on every change and let the client diff by id, so one new
          // event cost a full payload. `removed` is skipped on purpose: with
          // orderBy+limit it fires when an old event falls out of the window,
          // which is not a deletion and must not evict anything client-side.
          const changed = snapshot
            .docChanges()
            .filter((c) => c.type === "added" || c.type === "modified");

          if (changed.length === 0) return;

          total += changed.filter((c) => c.type === "added").length;
          send({ type: "append", events: changed.map((c) => toWireEvent(c.doc)), total });
        },
        (error) => {
          console.error("[SSE] Firestore listener error:", error);
          send({ type: "error", message: error.message });
          teardown();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      );

      // Covers navigations and tab closes that never trigger `cancel`.
      req.signal.addEventListener("abort", teardown);
    },

    cancel() {
      teardownRef?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
