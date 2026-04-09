/**
 * OrbitOS — Dashboard Seed Script
 * 
 * Purpose:
 *   1. Find the user document for org 9ezr6k7YIUF2RECK2xBF
 *   2. Elevate role from "member" → "owner"
 *   3. Seed 1 project + 5 tasks with mixed states
 * 
 * Usage:
 *   npx ts-node --compiler-options '{"module":"commonjs"}' scripts/seed-dashboard.ts
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import * as path from "path";
import * as fs from "fs";

// Load .env.local manually (no dotenv dependency needed)
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex === -1) continue;
  const key = trimmed.slice(0, eqIndex);
  const value = trimmed.slice(eqIndex + 1);
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const ORG_ID = "9ezr6k7YIUF2RECK2xBF";

// ─── Init Admin SDK ───────────────────────────────────────────────────────────
const app = initializeApp({
  credential: cert({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || "",
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
});

const db = getFirestore(app);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysFromNow(days: number): Timestamp {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 0, 0);
  return Timestamp.fromDate(d);
}

function todayEnd(): Timestamp {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return Timestamp.fromDate(d);
}

// ─── Phase 1: Discover & Elevate User ─────────────────────────────────────────
async function elevateRole(): Promise<string> {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  PHASE 1 — Membership Verification & Role Elevation");
  console.log("═══════════════════════════════════════════════════════\n");

  const usersSnap = await db
    .collection("users")
    .where("orgId", "==", ORG_ID)
    .get();

  if (usersSnap.empty) {
    throw new Error(`No users found for orgId: ${ORG_ID}`);
  }

  console.log(`  Found ${usersSnap.size} user(s) in org ${ORG_ID}:\n`);

  let targetUid = "";

  usersSnap.forEach((doc) => {
    const data = doc.data();
    console.log(`  ┌─ User Document: users/${doc.id}`);
    console.log(`  │  email:     ${data.email}`);
    console.log(`  │  name:      ${data.name}`);
    console.log(`  │  role:      ${data.role}`);
    console.log(`  │  orgId:     ${data.orgId}`);
    console.log(`  └─ createdAt: ${data.createdAt?.toDate?.() || "N/A"}\n`);

    // Take the first user (or the one with "member" role) as our target
    if (!targetUid) {
      targetUid = doc.id;
    }
  });

  // Read current role
  const userRef = db.collection("users").doc(targetUid);
  const userDoc = await userRef.get();
  const currentRole = userDoc.data()?.role;

  if (currentRole === "owner") {
    console.log(`  ✓ User ${targetUid} is already an owner. No change needed.\n`);
  } else {
    console.log(`  ⟁ Elevating user ${targetUid} from "${currentRole}" → "owner"...`);
    await userRef.update({ role: "owner" });
    console.log(`  ✓ Role updated successfully.\n`);
  }

  // Verify
  const verified = await userRef.get();
  console.log(`  Verified role: ${verified.data()?.role}\n`);

  return targetUid;
}

// ─── Phase 2: Seed Project & Tasks ────────────────────────────────────────────
async function seedData(ownerUid: string): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  PHASE 2 — Seed Dashboard Data");
  console.log("═══════════════════════════════════════════════════════\n");

  // Check for existing projects
  const existingProjects = await db
    .collection("projects")
    .where("orgId", "==", ORG_ID)
    .get();

  if (!existingProjects.empty) {
    console.log(`  ⚠ Found ${existingProjects.size} existing project(s). Skipping project creation.`);
    console.log(`    Existing: ${existingProjects.docs.map(d => d.data().name).join(", ")}\n`);
    
    // Check tasks too
    const existingTasks = await db
      .collection("tasks")
      .where("orgId", "==", ORG_ID)
      .get();
    
    if (!existingTasks.empty) {
      console.log(`  ⚠ Found ${existingTasks.size} existing task(s). Skipping seed entirely.`);
      console.log(`  → Dashboard should already have data. Refresh the browser.\n`);
      return;
    }

    // If project exists but no tasks, use the existing project
    const projectId = existingProjects.docs[0].id;
    console.log(`  Using existing project ${projectId} for task seeding.\n`);
    await seedTasks(projectId, ownerUid);
    return;
  }

  // ── Create Project ──────────────────────────────────────────────────────────
  const now = Timestamp.now();
  const projectData = {
    orgId: ORG_ID,
    name: "OrbitOS Core Platform",
    ownerId: ownerUid,
    createdAt: now,
  };

  const projectRef = await db.collection("projects").add(projectData);
  const projectId = projectRef.id;

  console.log(`  ✓ Project created: projects/${projectId}`);
  console.log(`    name:    ${projectData.name}`);
  console.log(`    ownerId: ${ownerUid}\n`);

  // ── Create Tasks ────────────────────────────────────────────────────────────
  await seedTasks(projectId, ownerUid);
}

async function seedTasks(projectId: string, ownerUid: string): Promise<void> {
  const now = Timestamp.now();

  const tasks = [
    {
      orgId: ORG_ID,
      projectId,
      title: "Design system token audit",
      description: "Audit all design tokens to ensure consistency across the Architectural Void design language. Verify color scales, spacing units, and typography tokens.",
      status: "todo" as const,
      assignedTo: ownerUid,
      createdBy: ownerUid,
      dueDate: todayEnd(),           // due_today
      createdAt: now,
      updatedAt: now,
      lastUpdatedAt: now,
      completedAt: null,
      isBlocked: false,
      blockedReason: "",
    },
    {
      orgId: ORG_ID,
      projectId,
      title: "Implement auth session refresh",
      description: "Add automatic token refresh logic to prevent session expiry during long dashboard sessions. Handle edge cases for background tabs.",
      status: "doing" as const,
      assignedTo: ownerUid,
      createdBy: ownerUid,
      dueDate: daysFromNow(1),       // due_tomorrow
      createdAt: now,
      updatedAt: now,
      lastUpdatedAt: now,
      completedAt: null,
      isBlocked: false,
      blockedReason: "",
    },
    {
      orgId: ORG_ID,
      projectId,
      title: "Migrate legacy API endpoints",
      description: "Refactor deprecated v1 API routes to the new modular architecture. Blocked on backend team completing their deployment pipeline changes.",
      status: "doing" as const,
      assignedTo: ownerUid,
      createdBy: ownerUid,
      dueDate: daysFromNow(-1),      // overdue (yesterday)
      createdAt: now,
      updatedAt: now,
      lastUpdatedAt: now,
      completedAt: null,
      isBlocked: true,               // BLOCKED
      blockedReason: "Waiting on backend team deploy",
    },
    {
      orgId: ORG_ID,
      projectId,
      title: "Dashboard metrics integration",
      description: "Wire up real-time aggregation for owner dashboard metrics including active projects, overdue counts, and team capacity indicators.",
      status: "todo" as const,
      assignedTo: ownerUid,
      createdBy: ownerUid,
      dueDate: todayEnd(),           // due_today
      createdAt: now,
      updatedAt: now,
      lastUpdatedAt: now,
      completedAt: null,
      isBlocked: false,
      blockedReason: "",
    },
    {
      orgId: ORG_ID,
      projectId,
      title: "Write onboarding flow E2E tests",
      description: "Create comprehensive end-to-end test coverage for the full onboarding flow including org creation, first project setup, and team invite sequences.",
      status: "todo" as const,
      assignedTo: ownerUid,
      createdBy: ownerUid,
      dueDate: daysFromNow(-3),      // overdue (3 days ago)
      createdAt: now,
      updatedAt: now,
      lastUpdatedAt: now,
      completedAt: null,
      isBlocked: false,
      blockedReason: "",
    },
  ];

  console.log("  Creating tasks:\n");

  for (const task of tasks) {
    const ref = await db.collection("tasks").add(task);
    const overdueTag = task.dueDate && task.dueDate.toDate() < new Date() ? " [OVERDUE]" : "";
    const blockedTag = task.isBlocked ? " [BLOCKED]" : "";
    const dueTodayTag = !overdueTag && task.dueDate && 
      task.dueDate.toDate().toDateString() === new Date().toDateString() ? " [DUE TODAY]" : "";

    console.log(`  ✓ tasks/${ref.id}`);
    console.log(`    "${task.title}"`);
    console.log(`    status: ${task.status} | assigned: ${task.assignedTo}${overdueTag}${blockedTag}${dueTodayTag}\n`);
  }
}

// ─── Phase 3: Verification ───────────────────────────────────────────────────
async function verify(ownerUid: string): Promise<void> {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  PHASE 3 — Verification");
  console.log("═══════════════════════════════════════════════════════\n");

  const userDoc = await db.collection("users").doc(ownerUid).get();
  const projects = await db.collection("projects").where("orgId", "==", ORG_ID).get();
  const tasks = await db.collection("tasks").where("orgId", "==", ORG_ID).get();

  console.log(`  User Role:      ${userDoc.data()?.role}`);
  console.log(`  Live Projects:  ${projects.size}`);
  console.log(`  Live Tasks:     ${tasks.size}`);

  const taskStatuses = { todo: 0, doing: 0, done: 0 };
  let blockedCount = 0;
  let overdueCount = 0;
  const now = new Date();

  tasks.forEach((doc) => {
    const d = doc.data();
    taskStatuses[d.status as keyof typeof taskStatuses]++;
    if (d.isBlocked) blockedCount++;
    if (d.dueDate && d.status !== "done" && d.dueDate.toDate() < now) overdueCount++;
  });

  console.log(`  Task Breakdown: todo=${taskStatuses.todo}, doing=${taskStatuses.doing}, done=${taskStatuses.done}`);
  console.log(`  Blocked:        ${blockedCount}`);
  console.log(`  Overdue:        ${overdueCount}`);
  console.log(`\n  ✓ Seed complete. Refresh the dashboard at http://localhost:3000/dashboard\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════╗");
  console.log("║   OrbitOS — Role Elevation & Dashboard Seed Script   ║");
  console.log("╚═══════════════════════════════════════════════════════╝");

  try {
    const ownerUid = await elevateRole();
    await seedData(ownerUid);
    await verify(ownerUid);
  } catch (err) {
    console.error("\n  ✗ Fatal error:", err);
    process.exit(1);
  }

  process.exit(0);
}

main();
