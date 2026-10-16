"use client";

import { useCallback, useEffect, useState } from "react";

import { getTeamLeadIdsAction } from "@/app/actions/team-structure";
import { rankOf, type Rank } from "@/lib/members/rank";

/* ------------------------------------------------------------------ */
/*  The rank a person is shown as                                      */
/*                                                                     */
/*  Everything but Team Lead is on the person's own document. Team     */
/*  Lead lives on departments, which no client reads, so the lead ids  */
/*  come from the server once per page load and are shared by every    */
/*  avatar that asks. A lead change shows on the next load.            */
/* ------------------------------------------------------------------ */

let cached: Promise<ReadonlySet<string>> | null = null;

function loadLeadIds(): Promise<ReadonlySet<string>> {
  cached ??= getTeamLeadIdsAction()
    .then((result) => new Set(result.success ? result.leadIds : []))
    .catch(() => new Set<string>());
  return cached;
}

/** Forget the cached leads, after this screen changes who leads a department. */
export function invalidateTeamLeads() {
  cached = null;
}

/** A function from a person to the rank their halo shows. */
export function useMemberRank(): (person: { id: string; role?: unknown } | null | undefined) => Rank {
  const [leadIds, setLeadIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    let live = true;
    loadLeadIds().then((ids) => {
      if (live) setLeadIds(ids);
    });
    return () => {
      live = false;
    };
  }, []);

  return useCallback(
    (person) => (person ? rankOf(person.role, leadIds.has(person.id)) : "MEMBER"),
    [leadIds]
  );
}
