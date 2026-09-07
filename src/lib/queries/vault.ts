import { db } from "@/lib/firebase/client";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { EMPTY_VAULT_USAGE, type VaultDocument, type VaultUsage } from "@/types/vault";

/* ------------------------------------------------------------------ */
/*  Reading the Vault from the browser                                 */
/*                                                                     */
/*  Firestore rules filter nothing: a query that touches even one      */
/*  document the rules deny fails in full, it does not quietly return  */
/*  the rest. So a member cannot simply read the collection and let    */
/*  the rules hide what they may not see — that query is rejected      */
/*  outright and the shelf renders empty.                              */
/*                                                                     */
/*  What a member runs instead is two queries they are entirely        */
/*  allowed to run — everything marked INTERNAL, and everything they   */
/*  filed themselves — merged here. An owner needs neither, and runs   */
/*  the plain collection query.                                        */
/*                                                                     */
/*  This is why the clearance predicate lives in `lib/vault/access`    */
/*  and is spelled once: these `where` clauses have to mean exactly    */
/*  what `canReadVaultDocument` means, or the list and the download    */
/*  disagree about what a person can see.                              */
/* ------------------------------------------------------------------ */

function hydrate(snapshot: QuerySnapshot<DocumentData>): VaultDocument[] {
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as VaultDocument);
}

function byNewest(a: VaultDocument, b: VaultDocument): number {
  const at = a.createdAt?.toMillis?.() ?? 0;
  const bt = b.createdAt?.toMillis?.() ?? 0;
  return bt - at;
}

export interface VaultViewer {
  uid: string;
  isOwner: boolean;
}

/**
 * Subscribes to every Vault document this viewer is cleared to see.
 *
 * `onReady` fires once both underlying queries have reported at least
 * once, so a member's list does not flash their own uploads before the
 * internal shelf arrives a moment later.
 */
export function subscribeToVault(
  orgId: string,
  viewer: VaultViewer,
  onChange: (documents: VaultDocument[]) => void,
  onError?: (error: Error) => void
): () => void {
  const shelf = collection(db, "organizations", orgId, "vault");

  if (viewer.isOwner) {
    return onSnapshot(
      query(shelf, orderBy("createdAt", "desc")),
      (snap) => onChange(hydrate(snap)),
      (error) => {
        console.error("[Vault] Subscription error:", error);
        onError?.(error);
        onChange([]);
      }
    );
  }

  /* Two streams, merged by id. A document the member filed themselves
     that is also INTERNAL arrives on both, which is why this is a map
     keyed by id rather than a concatenation. */
  const internal = new Map<string, VaultDocument>();
  const own = new Map<string, VaultDocument>();

  const emit = () => {
    const merged = new Map(internal);
    for (const [id, document] of own) merged.set(id, document);
    onChange([...merged.values()].sort(byNewest));
  };

  const fail = (error: Error) => {
    console.error("[Vault] Subscription error:", error);
    onError?.(error);
  };

  const unsubInternal = onSnapshot(
    query(shelf, where("clearance", "==", "INTERNAL"), orderBy("createdAt", "desc")),
    (snap) => {
      internal.clear();
      for (const document of hydrate(snap)) internal.set(document.id, document);
      emit();
    },
    fail
  );

  const unsubOwn = onSnapshot(
    query(shelf, where("uploadedBy", "==", viewer.uid), orderBy("createdAt", "desc")),
    (snap) => {
      own.clear();
      for (const document of hydrate(snap)) own.set(document.id, document);
      emit();
    },
    fail
  );

  return () => {
    unsubInternal();
    unsubOwn();
  };
}

/**
 * Subscribes to the workspace's stored totals.
 *
 * Read off the organization document rather than summed from the list,
 * because the list is already filtered by clearance — a member summing
 * what they can see would be told the Vault is nearly empty while the
 * next upload is refused.
 */
export function subscribeToVaultUsage(
  orgId: string,
  onChange: (usage: VaultUsage) => void
): () => void {
  return onSnapshot(
    doc(db, "organizations", orgId),
    (snap) => {
      const usage = snap.data()?.vaultUsage as Partial<VaultUsage> | undefined;
      onChange({
        documents: Number(usage?.documents) || 0,
        bytes: Number(usage?.bytes) || 0,
      });
    },
    (error) => {
      console.error("[Vault] Usage subscription error:", error);
      onChange({ ...EMPTY_VAULT_USAGE });
    }
  );
}
