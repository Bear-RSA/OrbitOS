import { Timestamp } from "firebase-admin/firestore";

/* ------------------------------------------------------------------ */
/*  In-memory Firestore double                                         */
/*                                                                     */
/*  Test-only. Not imported by anything that ships — it lives under    */
/*  src so it shares the `@/` alias and gets typechecked with          */
/*  everything else, but `vitest.config.mts` only collects `*.test.ts` */
/*  so it is never run as a suite.                                     */
/*                                                                     */
/*  The server modules touch a small and stable slice of the Admin     */
/*  SDK: chained `where`, `doc().get()`, `getAll`, and a batch of      */
/*  sets and updates. Standing that up in memory keeps the suite       */
/*  runnable with no emulator, no credentials, and no network — which  */
/*  matters most for the modules that would otherwise send real email  */
/*  against a real billing account.                                    */
/*                                                                     */
/*  Deliberately NOT a general Firestore implementation. Anything the  */
/*  production code does not do throws loudly rather than guessing, so */
/*  a test can never pass against behaviour the real SDK would reject. */
/* ------------------------------------------------------------------ */

export type Row = Record<string, unknown>;

type Filter = [field: string, op: string, value: unknown];

/** Millis for anything comparable that a query filters on. */
function millis(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value);
}

/**
 * True for a `FieldValue.increment(n)` sentinel.
 *
 * Matched structurally rather than by importing the class, which is not
 * exported from the SDK's public surface.
 */
function incrementOperand(value: unknown): number | null {
  if (typeof value !== "object" || value === null) return null;
  if (value.constructor?.name !== "NumericIncrementTransform") return null;
  return Number((value as { operand: number }).operand);
}

function matches(doc: Row, [field, op, value]: Filter): boolean {
  const actual = doc[field];

  if (op === "==") return actual === value;
  if (op === "in") return Array.isArray(value) && value.includes(actual);
  if (op === "array-contains") {
    return Array.isArray(actual) && actual.includes(value);
  }

  if (actual === undefined || actual === null) return false;
  if (op === ">=") return millis(actual) >= millis(value);
  if (op === ">") return millis(actual) > millis(value);
  if (op === "<=") return millis(actual) <= millis(value);
  if (op === "<") return millis(actual) < millis(value);

  throw new Error(`fake firestore: unsupported operator "${op}"`);
}

export interface FakeSnapshot {
  id: string;
  exists: boolean;
  data: () => Row | undefined;
}

/** A document reference carrying just enough to resolve itself later. */
export interface FakeRef {
  __collection: string;
  __id: string;
  get(): Promise<FakeSnapshot>;
  set(data: Row): Promise<void>;
  update(data: Row): Promise<void>;
  create(data: Row): Promise<void>;
}

export class FakeFirestore {
  /** collection -> id -> document */
  private store = new Map<string, Map<string, Row>>();

  /** Commits observed, so a test can assert that nothing was written. */
  batchCommits = 0;

  /** Every `ref.update()` / `ref.set()` made outside a batch, in order. */
  directWrites: { collection: string; id: string; data: Row }[] = [];

  reset() {
    this.store.clear();
    this.batchCommits = 0;
    this.directWrites = [];
  }

  seed(collection: string, id: string, data: Row) {
    if (!this.store.has(collection)) this.store.set(collection, new Map());
    this.store.get(collection)!.set(id, data);
  }

  read(collection: string, id: string): Row | undefined {
    return this.store.get(collection)?.get(id);
  }

  /** Ids currently held in a collection, for existence assertions. */
  ids(collection: string): string[] {
    return [...(this.store.get(collection) ?? new Map()).keys()];
  }

  private apply(collection: string, id: string, data: Row, merge: boolean) {
    const existing = merge ? (this.read(collection, id) ?? {}) : {};
    const next: Row = { ...existing };

    for (const [key, value] of Object.entries(data)) {
      const operand = incrementOperand(value);
      next[key] = operand === null ? value : Number(next[key] ?? 0) + operand;
    }

    this.seed(collection, id, next);
  }

  /* Arrow properties throughout below: these objects are handed to the
     code under test, which calls them detached from the instance. */
  private ref = (collection: string, id: string): FakeRef => ({
    __collection: collection,
    __id: id,
    get: async () => {
      const data = this.read(collection, id);
      return { id, exists: data !== undefined, data: () => data };
    },
    set: async (data: Row) => {
      this.directWrites.push({ collection, id, data });
      this.apply(collection, id, data, false);
    },
    update: async (data: Row) => {
      this.directWrites.push({ collection, id, data });
      this.apply(collection, id, data, true);
    },
    /* Rejects when the document already exists, which is what makes it an
       atomic claim without a transaction. The debrief uses that to stop a
       retry inside the same window from mailing everybody twice, so the
       rejection is the behaviour under test, not an edge case. */
    create: async (data: Row) => {
      if (this.read(collection, id) !== undefined) {
        throw new Error(`ALREADY_EXISTS: ${collection}/${id}`);
      }
      this.directWrites.push({ collection, id, data });
      this.apply(collection, id, data, false);
    },
  });

  /** The `adminDb` stand-in handed to `vi.mock("@/lib/firebase/admin")`. */
  collection = (name: string) => {
    const build = (filters: Filter[], cap: number | null) => ({
      where: (field: string, op: string, value: unknown) =>
        build([...filters, [field, op, value]], cap),

      limit: (n: number) => build(filters, n),

      get: async () => {
        const rows = [...(this.store.get(name) ?? new Map()).entries()].filter(
          ([, data]) => filters.every((f) => matches(data, f))
        );
        const capped = cap === null ? rows : rows.slice(0, cap);
        const docs: FakeSnapshot[] = capped.map(([id, data]) => ({
          id,
          exists: true,
          data: () => data,
        }));
        return { docs, empty: docs.length === 0, size: docs.length };
      },

      doc: (id: string) => this.ref(name, id),
    });

    return build([], null);
  };

  getAll = async (...refs: FakeRef[]): Promise<FakeSnapshot[]> => {
    return refs.map((ref) => {
      const data = this.read(ref.__collection, ref.__id);
      return { id: ref.__id, exists: data !== undefined, data: () => data };
    });
  };

  batch = () => {
    const writes: { ref: FakeRef; data: Row; merge: boolean }[] = [];

    return {
      set: (ref: FakeRef, data: Row) => {
        writes.push({ ref, data, merge: false });
      },
      update: (ref: FakeRef, data: Row) => {
        writes.push({ ref, data, merge: true });
      },
      commit: async () => {
        this.batchCommits += 1;
        for (const { ref, data, merge } of writes) {
          this.apply(ref.__collection, ref.__id, data, merge);
        }
      },
    };
  };
}
