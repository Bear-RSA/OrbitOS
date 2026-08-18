/* ------------------------------------------------------------------ */
/*  Data Integrity Backfill                                            */
/*                                                                     */
/*  Repairs shape drift that accumulated in Firestore before the       */
/*  current schema settled. Every step is idempotent — re-running      */
/*  after a successful pass writes nothing.                            */
/*                                                                     */
/*  DRY RUN BY DEFAULT. Nothing is written without --apply.            */
/*                                                                     */
/*    node scripts/backfill-data-integrity.js                  (report)*/
/*    node scripts/backfill-data-integrity.js --apply          (write) */
/*                                                                     */
/*  Steps (default ON):  --no-tasks  --no-duedates  --no-roles to skip */
/*  Steps (default OFF): --activity        reclassify fake transitions */
/*                       --merge-user=FROM:TO   remap assignments      */
/* ------------------------------------------------------------------ */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const admin = require(path.join(ROOT, "node_modules", "firebase-admin"));

/* ---------------------------- CLI ---------------------------------- */

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valueOf = (prefix) => {
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

const APPLY = has("--apply");
const DO_TASKS = !has("--no-tasks");
const DO_DUEDATES = !has("--no-duedates");
const DO_ROLES = !has("--no-roles");
const DO_ACTIVITY = has("--activity");
const MERGE = valueOf("--merge-user=");

/* ------------------------- Bootstrap ------------------------------- */

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) {
    throw new Error(".env.local not found — admin credentials are required.");
  }
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: (env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
});
const db = admin.firestore();

/* --------------------------- Helpers ------------------------------- */

const CHUNK = 400; // Firestore caps a batch at 500 ops; leave headroom.

/** Applies queued writes in chunked batches. No-op in dry-run. */
async function flush(writes, label) {
  if (!writes.length) {
    console.log(`   nothing to change`);
    return;
  }
  if (!APPLY) {
    console.log(`   ${writes.length} document(s) would be updated — re-run with --apply`);
    return;
  }
  for (let i = 0; i < writes.length; i += CHUNK) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + CHUNK)) batch.update(w.ref, w.data);
    await batch.commit();
    console.log(`   committed ${Math.min(i + CHUNK, writes.length)}/${writes.length}`);
  }
  console.log(`   ✓ ${label}: ${writes.length} document(s) updated`);
}

/** The canonical shape: always a de-duplicated array of non-empty strings. */
function normalizeAssignedTo(val) {
  if (Array.isArray(val)) {
    return [...new Set(val.filter((v) => typeof v === "string" && v.length > 0))];
  }
  if (typeof val === "string" && val.length > 0) return [val];
  return [];
}

const sameArray = (a, b) =>
  Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);

function heading(title) {
  console.log(`\n${"─".repeat(64)}\n${title}\n${"─".repeat(64)}`);
}

/* ------------------------- Step 1: tasks ---------------------------- */
/*  assignedTo currently exists as array | bare string | null.
    Every read path has to defend against this; normalizing at rest
    lets those workarounds be deleted. Critically, removeMemberAction
    queries with `array-contains`, which silently skips string-shaped
    documents — so unassignment is currently incomplete.               */

async function backfillTaskAssignees() {
  heading("STEP 1 · tasks.assignedTo → string[]");

  const snap = await db.collection("tasks").get();
  const writes = [];
  const tally = { array: 0, string: 0, empty: 0 };

  for (const doc of snap.docs) {
    const raw = doc.data().assignedTo;
    const next = normalizeAssignedTo(raw);

    if (Array.isArray(raw)) {
      tally.array++;
      if (sameArray(raw, next)) continue; // already canonical
    } else if (typeof raw === "string" && raw.length > 0) {
      tally.string++;
    } else {
      tally.empty++;
    }

    writes.push({ ref: doc.ref, data: { assignedTo: next } });
  }

  console.log(`   scanned ${snap.size} tasks — array:${tally.array} string:${tally.string} null/empty:${tally.empty}`);
  await flush(writes, "assignedTo normalized");
}

/* ------------------------- Step 2: roles ---------------------------- */
/*  Role is compared as both casings in ~6 places. Normalizing to
    upper-case is safe to do first: every existing check and every
    Firestore rule already accepts the upper-case form, so the
    dual-casing comparisons can be removed afterwards, not before.     */

async function backfillRoleCasing() {
  heading("STEP 2 · users.role → OWNER | MEMBER");

  const snap = await db.collection("users").get();
  const writes = [];
  const unresolved = [];

  for (const doc of snap.docs) {
    const role = doc.data().role;

    if (typeof role !== "string" || role.length === 0) {
      unresolved.push(`${doc.id} ("${doc.data().name || "no name"}") role=${role} orgId=${doc.data().orgId ?? "none"}`);
      continue;
    }
    const upper = role.toUpperCase();
    if (upper !== "OWNER" && upper !== "MEMBER") {
      unresolved.push(`${doc.id} ("${doc.data().name || "no name"}") unexpected role="${role}"`);
      continue;
    }
    if (upper === role) continue; // already canonical

    writes.push({ ref: doc.ref, data: { role: upper } });
  }

  console.log(`   scanned ${snap.size} users`);
  if (unresolved.length) {
    console.log(`   ⚠ ${unresolved.length} user(s) left untouched — needs a human decision:`);
    unresolved.forEach((u) => console.log(`      ${u}`));
  }
  await flush(writes, "role casing normalized");
}

/* --------------------- Step 2b: due date keys ----------------------- */
/*  dueDate was written as an instant parsed from a "YYYY-MM-DD" form
    value, which lands on UTC midnight — so the day a task appears on
    depends on the reader's timezone. A list view hides that; the
    calendar grid does not. `dueDateKey` carries the day explicitly.

    The intended day is the UTC day of the stored instant under both
    encodings (legacy UTC midnight, current UTC midday), so the key can
    be derived without guessing at the author's timezone. The Timestamp
    is re-pinned to UTC midday at the same time, which keeps it inside
    the correct day for every reader from UTC-11 to UTC+11.            */

async function backfillDueDateKeys() {
  heading("STEP 2b · tasks.dueDateKey → YYYY-MM-DD");

  const snap = await db.collection("tasks").get();
  const writes = [];
  const tally = { keyed: 0, derived: 0, none: 0, unreadable: 0 };

  for (const doc of snap.docs) {
    const data = doc.data();

    if (typeof data.dueDateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.dueDateKey)) {
      tally.keyed++;
      continue; // already canonical
    }

    // `horizon` is the pre-rename field name; some rows still carry it.
    const raw = data.dueDate || data.horizon;
    if (!raw) {
      tally.none++;
      // Materialize the absence so every document has the same shape.
      if (data.dueDateKey !== null) {
        writes.push({ ref: doc.ref, data: { dueDateKey: null } });
      }
      continue;
    }

    const asDate =
      typeof raw.toDate === "function" ? raw.toDate() : new Date(raw);
    if (Number.isNaN(asDate.getTime())) {
      tally.unreadable++;
      console.log(`   ⚠ ${doc.id} ("${data.title || "untitled"}") has an unreadable dueDate — left as-is`);
      continue;
    }

    const key = asDate.toISOString().slice(0, 10);
    const [y, m, d] = key.split("-").map(Number);
    const pinned = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));

    tally.derived++;
    writes.push({
      ref: doc.ref,
      data: {
        dueDateKey: key,
        dueDate: admin.firestore.Timestamp.fromDate(pinned),
      },
    });
  }

  console.log(`   scanned ${snap.size} tasks — already keyed:${tally.keyed} derived:${tally.derived} no due date:${tally.none} unreadable:${tally.unreadable}`);
  await flush(writes, "dueDateKey backfilled");
}

/* ------------------------ Step 3: activity -------------------------- */
/*  Edits and note-additions are written as DIRECTIVE_TRANSITION with
    placeholder from/to strings, so the Command Center renders
    "moved from Edited to Updated". This reclassifies the historical
    records; the write path that produces them still needs fixing or
    the pollution simply resumes.                                      */

const TRANSITION_REMAP = {
  Edited: "DIRECTIVE_EDITED",
  "Note Added": "NOTE_ADDED",
};

async function backfillActivityEvents() {
  heading("STEP 3 · activity · reclassify placeholder transitions");

  const snap = await db.collection("activity").where("eventType", "==", "DIRECTIVE_TRANSITION").get();
  const writes = [];
  const tally = {};

  for (const doc of snap.docs) {
    const data = doc.data();
    const from = data.metadata?.from;
    const target = TRANSITION_REMAP[from];
    if (!target) continue;

    tally[from] = (tally[from] || 0) + 1;

    // Drop the placeholder from/to; keep everything else in metadata so
    // the feed keeps its taskTitle and the record stays auditable.
    const metadata = { ...data.metadata };
    delete metadata.from;
    delete metadata.to;

    writes.push({ ref: doc.ref, data: { eventType: target, metadata } });
  }

  console.log(`   scanned ${snap.size} DIRECTIVE_TRANSITION events`);
  Object.entries(tally).forEach(([k, v]) => console.log(`      "${k}" → ${TRANSITION_REMAP[k]}: ${v}`));
  await flush(writes, "activity reclassified");
}

/* ------------------------ Step 4: user merge ------------------------ */
/*  Opt-in and explicit: identity merges are not something to infer.
    Remaps task assignments only. Activity actor attribution is left
    alone — it is a historical record of who did what, and rewriting it
    would be a lie even when the two accounts are the same human.      */

async function mergeUser(fromUid, toUid) {
  heading(`STEP 4 · merge assignments ${fromUid} → ${toUid}`);

  const [fromDoc, toDoc] = await Promise.all([
    db.collection("users").doc(fromUid).get(),
    db.collection("users").doc(toUid).get(),
  ]);

  console.log(`   source: ${fromDoc.exists ? `"${fromDoc.data().name}" role=${fromDoc.data().role} orgId=${fromDoc.data().orgId ?? "none"}` : "NO USER DOC"}`);
  if (!toDoc.exists) {
    console.log(`   ✗ target ${toUid} has no user document — aborting merge.`);
    return;
  }
  const to = toDoc.data();
  console.log(`   target: "${to.name}" role=${to.role} orgId=${to.orgId ?? "none"}`);
  if (!to.orgId) {
    console.log(`   ✗ target has no orgId, so remapped tasks would still be orphaned — aborting merge.`);
    return;
  }

  // assignedTo is not uniformly an array yet, so scan rather than query.
  const snap = await db.collection("tasks").get();
  const writes = [];

  for (const doc of snap.docs) {
    const current = normalizeAssignedTo(doc.data().assignedTo);
    if (!current.includes(fromUid)) continue;

    const next = [...new Set(current.map((u) => (u === fromUid ? toUid : u)))];
    writes.push({ ref: doc.ref, data: { assignedTo: next } });
    console.log(`      "${doc.data().title}" ${JSON.stringify(current)} → ${JSON.stringify(next)}`);
  }

  // Ownership references are reported, never rewritten — reassigning a
  // project owner is a business decision, not a data repair.
  const owned = await db.collection("projects").where("ownerId", "==", fromUid).get();
  const created = await db.collection("projects").where("createdBy", "==", fromUid).get();
  if (owned.size || created.size) {
    console.log(`   ⚠ source uid still referenced as ownerId on ${owned.size} and createdBy on ${created.size} project(s) — left as-is.`);
  }

  const acts = await db.collection("activity").where("actor.uid", "==", fromUid).get();
  console.log(`   note: ${acts.size} activity event(s) keep the source uid as actor (historical record, unchanged).`);

  await flush(writes, "assignments remapped");

  if (APPLY && fromDoc.exists) {
    console.log(`   ⓘ user document ${fromUid} is left in place. Delete it manually once you have confirmed the merge.`);
  }
}

/* --------------------------- Report only ---------------------------- */

async function reportOrgs() {
  heading("REPORT · organizations (no writes)");

  const [orgs, projects, users] = await Promise.all([
    db.collection("organizations").get(),
    db.collection("projects").get(),
    db.collection("users").get(),
  ]);

  for (const o of orgs.docs) {
    const d = o.data();
    const pc = projects.docs.filter((p) => p.data().orgId === o.id && !p.data().archived).length;
    const uc = users.docs.filter((u) => u.data().orgId === o.id).length;
    const flag = uc <= 1 && pc === 0 ? "  ← empty, likely abandoned onboarding" : "";
    console.log(`   "${d.name}" (${o.id}): ${uc} user(s), ${pc} active project(s)${flag}`);
    if (!d.subscription) {
      console.log(`      no subscription field — fine while guardrails are off (see BILLING_GUARDRAILS_ENABLED)`);
    }
  }
  console.log(`\n   Empty orgs are reported, never deleted. Remove them by hand if you agree.`);
}

/* ------------------------------ Main -------------------------------- */

(async () => {
  console.log(APPLY ? "\n*** APPLY MODE — writes are live ***" : "\n*** DRY RUN — no writes. Add --apply to commit. ***");
  console.log(`Project: ${env.FIREBASE_PROJECT_ID}`);

  if (DO_TASKS) await backfillTaskAssignees();
  if (DO_DUEDATES) await backfillDueDateKeys();
  if (DO_ROLES) await backfillRoleCasing();
  if (DO_ACTIVITY) await backfillActivityEvents();

  if (MERGE) {
    const [from, to] = MERGE.split(":");
    if (!from || !to) {
      console.log("\n✗ --merge-user expects FROM_UID:TO_UID");
    } else {
      await mergeUser(from, to);
    }
  }

  await reportOrgs();

  console.log(APPLY ? "\nDone.\n" : "\nDry run complete — nothing was written.\n");
  process.exit(0);
})().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
