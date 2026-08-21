import { NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth/session";
import { validateOwner } from "@/lib/auth/permissions";
import { readRecentRunFailures } from "@/lib/tasks/run-log";

/* ------------------------------------------------------------------ */
/*  Mail health                                                        */
/*                                                                     */
/*  GET /api/health/mail                                               */
/*                                                                     */
/*  The read side of `scheduled_runs`. That collection is deny-all in  */
/*  firestore.rules, as workspace-wide operational state should be, so */
/*  this route is the only way into it — which makes the two checks    */
/*  below the security boundary rather than a formality. Middleware    */
/*  skips /api/* on the understanding that each route authenticates    */
/*  itself.                                                            */
/*                                                                     */
/*  OWNER only, and not merely on principle: a failure line quotes the */
/*  sender's error verbatim, and those name the recipient the mail was */
/*  refused for. That is a colleague's address, not the caller's.      */
/*                                                                     */
/*  Returns only runs that went badly. An empty array means every      */
/*  scheduled mail in the window went out, which is what lets the      */
/*  banner render nothing at all on a normal day.                      */
/* ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { isOwner } = await validateOwner(session.uid);
  if (!isOwner) {
    // Not an error the member can act on, and not their business either.
    return NextResponse.json({ failures: [] });
  }

  const failures = await readRecentRunFailures();

  return NextResponse.json({ failures });
}
