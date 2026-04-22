import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

/* ------------------------------------------------------------------ */
/*  SSE Telemetry Stream                                               */
/*                                                                     */
/*  The browser connects to /api/telemetry/stream?projectId=xxx        */
/*  This route uses the Firebase ADMIN SDK (server-side, no browser    */
/*  restrictions) to listen to Firestore, then relays events to the    */
/*  browser as Server-Sent Events over a standard HTTP connection.     */
/*                                                                     */
/*  This "cloaks" the Firestore connection as a first-party request,   */
/*  making it invisible to AdBlockers and browser Shields.             */
/* ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!projectId) {
    return new Response("Missing projectId", { status: 400 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send an initial heartbeat so the browser knows the connection is alive
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected", projectId })}\n\n`)
      );

      // Listen to Firestore via Admin SDK (server-to-server, no browser involved)
      // Note: We avoid orderBy("timestamp") here to bypass composite index requirements.
      const query = adminDb
        .collection("activity")
        .where("projectId", "==", projectId)
        .limit(100); // Fetch a bit more to ensure we have enough after sorting

      unsubscribe = query.onSnapshot(
        (snapshot) => {
          try {
            const events = snapshot.docs.map((doc) => {
              const data = doc.data();
              return {
                id: doc.id,
                eventType: data.eventType,
                projectId: data.projectId,
                orgId: data.orgId,
                actor: data.actor,
                metadata: data.metadata,
                // Convert Firestore Timestamp to ISO string for JSON serialization
                timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp || null,
              };
            });

            // Sort in memory by timestamp descending
            events.sort((a, b) => {
              const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
              const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
              return timeB - timeA;
            });

            // Take the most recent 50
            const recentEvents = events.slice(0, 50);

            const payload = `data: ${JSON.stringify({ type: "snapshot", events: recentEvents })}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (err) {
            console.error("[SSE] Error encoding snapshot:", err);
          }
        },
        (error) => {
          console.error("[SSE] Firestore listener error:", error);
          try {
            const payload = `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`;
            controller.enqueue(encoder.encode(payload));
          } catch (_) {
            // Stream may already be closed
          }
        }
      );
    },
    cancel() {
      // Client disconnected — clean up the Firestore listener
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable Nginx buffering if present
    },
  });
}
