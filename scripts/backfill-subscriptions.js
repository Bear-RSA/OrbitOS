/* ------------------------------------------------------------------ */
/*  Backfill organizations/{id}.subscription before tier enforcement   */
/*                                                                     */
/*  With BILLING_GUARDRAILS_ENABLED on, an org with no subscription    */
/*  field resolves to the free tier. This lists every org, its tier,   */
/*  and its usage against that tier, then (with --apply) writes a      */
/*  subscription onto the orgs that have none. Orgs that already have  */
/*  one are never touched.                                             */
/*                                                                     */
/*  DRY RUN BY DEFAULT. Nothing is written without --apply.            */
/*                                                                     */
/*    node scripts/backfill-subscriptions.js                  (report) */
/*    node scripts/backfill-subscriptions.js --apply --tier=exploration */
/*    add --only=<orgId,orgId> to write exactly those orgs              */
/* ------------------------------------------------------------------ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const admin = require(path.join(ROOT, "node_modules", "firebase-admin"));

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const TIER = (args.find((a) => a.startsWith("--tier=")) || "").slice("--tier=".length);
// Comma-separated org ids. When given, exactly these orgs are written,
// whether or not they already have a subscription.
const ONLY = (args.find((a) => a.startsWith("--only=")) || "")
  .slice("--only=".length)
  .split(",")
  .filter(Boolean);

// Mirrors the member, owner and project limits in src/types/subscription.ts.
const LIMITS = {
  exploration: { name: "Free", owners: 1, members: 2, projects: 3 },
  foundational: { name: "Standard", owners: 1, members: 5, projects: 5 },
  studio_core: { name: "Pro", owners: 3, members: 15, projects: 25 },
  total_visibility: { name: "Custom", owners: 5, members: -1, projects: -1 },
};

if (APPLY && !LIMITS[TIER]) {
  console.error(`--apply needs --tier=<${Object.keys(LIMITS).join("|")}>`);
  process.exit(1);
}

function loadEnv() {
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) {
    throw new Error(".env.local not found. Admin credentials are required.");
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

function over(count, limit) {
  return limit !== -1 && count > limit;
}

async function main() {
  console.log(APPLY ? `APPLY: missing subscriptions -> ${TIER}\n` : "DRY RUN (no writes)\n");

  const orgs = await db.collection("organizations").get();
  const missing = [];

  for (const org of orgs.docs) {
    const sub = org.data().subscription;
    const tier = sub && LIMITS[sub.tier] ? sub.tier : null;
    const effective = tier || (APPLY ? TIER : "exploration");
    const lim = LIMITS[effective];

    const [users, projects] = await Promise.all([
      db.collection("users").where("orgId", "==", org.id).get(),
      db.collection("projects").where("orgId", "==", org.id).get(),
    ]);
    const owners = users.docs.filter((d) => d.data().role === "OWNER").length;
    const members = users.size - owners;
    const active = projects.docs.filter((d) => !d.data().archived).length;

    const flags = [
      over(owners, lim.owners) && `owners ${owners}/${lim.owners}`,
      over(members, lim.members) && `members ${members}/${lim.members}`,
      over(active, lim.projects) && `projects ${active}/${lim.projects}`,
    ].filter(Boolean);

    console.log(
      `${org.id}  "${org.data().name || ""}"  ` +
        `tier=${tier || "(none)"}  owners=${owners} members=${members} projects=${active}` +
        (flags.length ? `  OVER ${lim.name}: ${flags.join(", ")}` : "")
    );

    if (ONLY.length ? ONLY.includes(org.id) : !tier) missing.push(org.ref);
  }

  if (ONLY.length && missing.length !== ONLY.length) {
    console.error(`\nFound ${missing.length} of ${ONLY.length} --only orgs. Nothing written.`);
    process.exit(1);
  }
  console.log(
    ONLY.length
      ? `\n${missing.length} orgs selected with --only.`
      : `\n${orgs.size} orgs, ${missing.length} without a subscription.`
  );

  if (!APPLY || !missing.length) return;

  const now = admin.firestore.Timestamp.now();
  for (let i = 0; i < missing.length; i += 400) {
    const batch = db.batch();
    for (const ref of missing.slice(i, i + 400)) {
      batch.update(ref, {
        subscription: { tier: TIER, status: "active", updatedAt: now },
      });
    }
    await batch.commit();
  }
  console.log(`Wrote tier=${TIER} to ${missing.length} orgs.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
