import { describe, expect, it } from "vitest";
import {
  MAX_TASK_REF_TITLE_LENGTH,
  isValidTaskRef,
  taskForwardPreview,
  taskRefFromTask,
  type TaskRefFacts,
} from "@/lib/messages/task-ref";
import { MESSAGE_PREVIEW_LENGTH } from "@/lib/validations/messages";

/* ------------------------------------------------------------------ */
/*  Forwarded task cards                                               */
/*                                                                     */
/*  Two things are worth pinning down. The snapshot has to survive a   */
/*  task document that is not the shape today's code writes — these    */
/*  come off Firestore, not out of a form. And the guard has to refuse */
/*  a half-written card, because the thread draws whatever the         */
/*  listener hands it.                                                 */
/* ------------------------------------------------------------------ */

const facts = (over: Partial<TaskRefFacts> = {}): TaskRefFacts => ({
  taskId: "task_9f2",
  projectId: "proj_atlas",
  title: "Ship the onboarding rewrite",
  status: "doing",
  dueDateKey: "2026-09-30",
  isBlocked: false,
  assigneeNames: ["Sarah Chen"],
  ...over,
});

describe("taking the snapshot", () => {
  it("carries the reference and the state side by side", () => {
    expect(taskRefFromTask(facts())).toEqual({
      taskId: "task_9f2",
      projectId: "proj_atlas",
      title: "Ship the onboarding rewrite",
      status: "doing",
      dueDateKey: "2026-09-30",
      assigneeNames: ["Sarah Chen"],
      isBlocked: false,
    });
  });

  it("falls back to todo for a status nothing defines", () => {
    expect(taskRefFromTask(facts({ status: "archived" })).status).toBe("todo");
    expect(taskRefFromTask(facts({ status: undefined })).status).toBe("todo");
  });

  it("treats a missing horizon and a missing blocked flag as absent", () => {
    const ref = taskRefFromTask(
      facts({ dueDateKey: undefined, isBlocked: undefined })
    );
    expect(ref.dueDateKey).toBeNull();
    expect(ref.isBlocked).toBe(false);
  });

  it("bounds the title rather than copying an essay onto every listener", () => {
    const ref = taskRefFromTask(facts({ title: "n".repeat(400) }));
    expect(ref.title.length).toBe(MAX_TASK_REF_TITLE_LENGTH);
    expect(ref.title.endsWith("…")).toBe(true);
  });

  it("bounds the assignees too", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Operative ${i}`);
    expect(taskRefFromTask(facts({ assigneeNames: many })).assigneeNames).toHaveLength(8);
  });

  it("never leaves a card with no name on it", () => {
    expect(taskRefFromTask(facts({ title: "   " })).title).toBe("Untitled directive");
  });
});

describe("what the rail says", () => {
  it("leads with the note, because that is why the thread is unread", () => {
    expect(taskForwardPreview("Ship the rewrite", "Can you take this?")).toBe(
      "Can you take this? — Ship the rewrite"
    );
  });

  it("names the task when it was forwarded without a word", () => {
    expect(taskForwardPreview("Ship the rewrite", "")).toBe(
      "Shared a task: Ship the rewrite"
    );
  });

  it("flattens newlines so one preview stays one line", () => {
    expect(taskForwardPreview("Ship it", "look\n\nat this")).toBe(
      "look at this — Ship it"
    );
  });

  it("stays inside the rail's budget however long both halves are", () => {
    const preview = taskForwardPreview("t".repeat(300), "n".repeat(300));
    expect(preview.length).toBeLessThanOrEqual(MESSAGE_PREVIEW_LENGTH);
  });
});

describe("guarding what the thread draws", () => {
  it("accepts a card the server wrote", () => {
    expect(isValidTaskRef(taskRefFromTask(facts()))).toBe(true);
  });

  it("refuses one with nothing to link to", () => {
    expect(isValidTaskRef({ ...taskRefFromTask(facts()), taskId: "" })).toBe(false);
    expect(isValidTaskRef({ ...taskRefFromTask(facts()), projectId: "" })).toBe(false);
  });

  it("refuses a status the pill cannot render", () => {
    expect(isValidTaskRef({ ...taskRefFromTask(facts()), status: "blocked" })).toBe(false);
  });

  it("refuses a horizon that is neither a day nor absent", () => {
    expect(isValidTaskRef({ ...taskRefFromTask(facts()), dueDateKey: 17 })).toBe(false);
  });

  it("refuses an assignee list that is not a list of names", () => {
    expect(isValidTaskRef({ ...taskRefFromTask(facts()), assigneeNames: "Sarah" })).toBe(
      false
    );
    expect(isValidTaskRef({ ...taskRefFromTask(facts()), assigneeNames: [7] })).toBe(false);
  });

  it("refuses null, undefined and a bare string", () => {
    expect(isValidTaskRef(null)).toBe(false);
    expect(isValidTaskRef(undefined)).toBe(false);
    expect(isValidTaskRef("task_9f2")).toBe(false);
  });
});
