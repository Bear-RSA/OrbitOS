import { describe, expect, it } from "vitest";
import { formatTelemetryLine } from "./console-line";

const now = new Date(2026, 8, 13, 14, 3, 22);
const actor = { uid: "uid-bear-0001", name: "Bear" };

describe("formatTelemetryLine", () => {
  it("names the actor, the directive and the status change", () => {
    const line = formatTelemetryLine({
      eventType: "DIRECTIVE_TRANSITION",
      actor,
      projectId: "a1b2c3d4e5f6",
      metadata: { taskId: "t1", taskTitle: "Ship the thing", from: "in_progress", to: "done" },
      docId: "9f8e7d6c5b4a",
      now,
    });
    expect(line).toBe(
      '14:03:22 DIRECTIVE_TRANSITION by Bear — "Ship the thing" (in_progress → done) · project a1b2c3d4 · doc 9f8e7d6c',
    );
  });

  it("reads the rename call site's oldName/newName spelling", () => {
    const line = formatTelemetryLine({
      eventType: "PROJECT_RENAMED",
      actor,
      projectId: "p1",
      metadata: { projectId: "p1", oldName: "Alpha", newName: "Beta" },
      now,
    });
    expect(line).toBe('14:03:22 PROJECT_RENAMED by Bear — "Beta" (Alpha → Beta) · project p1');
  });

  it("does not print a uid transition for a direct call", () => {
    const line = formatTelemetryLine({
      eventType: "CALL_STARTED",
      actor,
      projectId: null,
      metadata: { callId: "c1", to: "uid-target-9999", toName: "Naledi" },
      now,
    });
    expect(line).toBe('14:03:22 CALL_STARTED by Bear — "Naledi" · org-wide');
  });

  it("flags an invite whose email did not go out", () => {
    const line = formatTelemetryLine({
      eventType: "INVITE_DISPATCHED",
      actor,
      projectId: null,
      metadata: { email: "x@y.z", emailSent: false, reused: true, regenerated: false },
      now,
    });
    expect(line).toBe(
      '14:03:22 INVITE_DISPATCHED by Bear — "x@y.z" (email NOT sent, invite reused) · org-wide',
    );
  });

  it("falls back to a short uid when the actor has no name", () => {
    const line = formatTelemetryLine({
      eventType: "SYSTEM_BOOT",
      actor: { uid: "uid-bear-0001", name: "" },
      projectId: null,
      metadata: {},
      now,
    });
    expect(line).toBe("14:03:22 SYSTEM_BOOT by uid-bear · org-wide");
  });

  it("puts details after a dash when there is no subject", () => {
    const line = formatTelemetryLine({
      eventType: "STATUS_TRANSITION",
      actor,
      projectId: null,
      metadata: { from: "Available", to: "Overloaded", load: "140%" },
      now,
    });
    expect(line).toBe(
      "14:03:22 STATUS_TRANSITION by Bear — (Available → Overloaded, load: 140%) · org-wide",
    );
  });
});
