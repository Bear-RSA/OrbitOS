#!/usr/bin/env node
/* ------------------------------------------------------------------ */
/*  OrbitOS MCP server                                                 */
/*                                                                     */
/*  Runs on your own machine, beside your AI assistant, and turns the  */
/*  OrbitOS `/api/v1` API into tools the assistant can call. It holds  */
/*  no state and no logic of its own: every check — workspace, plan,   */
/*  rate limit — happens on the OrbitOS server, so this file can stay  */
/*  a thin translation layer.                                          */
/*                                                                     */
/*  Configure with two environment variables:                          */
/*    ORBITOS_URL    e.g. https://your-orbitos-domain                  */
/*    ORBITOS_TOKEN  a token from Settings → AI access                 */
/* ------------------------------------------------------------------ */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.ORBITOS_URL || "").replace(/\/+$/, "");
const TOKEN = process.env.ORBITOS_TOKEN || "";

if (!BASE_URL || !TOKEN) {
  // stdout belongs to the MCP protocol; anything human goes to stderr.
  console.error("orbitos-mcp: set ORBITOS_URL and ORBITOS_TOKEN.");
  process.exit(1);
}

/** Calls the API and returns the parsed body, or throws the server's own message. */
async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text.slice(0, 200) };
  }
  if (!res.ok) throw new Error(data.error || `OrbitOS answered ${res.status}.`);
  return data;
}

/** Wraps a handler so a failure reaches the model as a readable tool error. */
function tool(handler) {
  return async (args) => {
    try {
      const result = await handler(args ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { isError: true, content: [{ type: "text", text: String(err.message || err) }] };
    }
  };
}

const status = z.enum(["todo", "doing", "done"]);
const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("A day, YYYY-MM-DD");

const server = new McpServer({ name: "orbitos", version: "0.1.0" });

server.registerTool(
  "whoami",
  {
    description: "Who this OrbitOS connection acts as: name, role, workspace, and whether it can make changes.",
    inputSchema: {},
  },
  tool(() => api("GET", "/me"))
);

server.registerTool(
  "list_tasks",
  {
    description:
      "List OrbitOS tasks, soonest due first. By default: open tasks assigned to me. " +
      "Use assignee='all' for the whole workspace, or a member id from list_members.",
    inputSchema: {
      assignee: z.string().optional().describe("'me' (default), 'all', or a member id"),
      status: status.optional(),
      projectId: z.string().optional(),
      includeDone: z.boolean().optional().describe("Include finished tasks"),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  tool(({ assignee, status, projectId, includeDone, limit }) => {
    const params = new URLSearchParams();
    if (assignee) params.set("assignee", assignee);
    if (status) params.set("status", status);
    if (projectId) params.set("projectId", projectId);
    if (includeDone) params.set("includeDone", "true");
    if (limit) params.set("limit", String(limit));
    const query = params.toString();
    return api("GET", `/tasks${query ? `?${query}` : ""}`);
  })
);

server.registerTool(
  "get_task",
  {
    description: "Full details of one task: description, assignees, due date, blocked state, and every note.",
    inputSchema: { taskId: z.string() },
  },
  tool(({ taskId }) => api("GET", `/tasks/${encodeURIComponent(taskId)}`))
);

server.registerTool(
  "create_task",
  {
    description:
      "Create a task in a project. Get projectId from list_projects and member ids from list_members.",
    inputSchema: {
      projectId: z.string(),
      title: z.string().max(200),
      description: z.string().optional(),
      assignedTo: z.array(z.string()).optional().describe("Member ids"),
      dueDate: dateKey.optional(),
      milestone: z.string().optional(),
    },
  },
  tool((args) => api("POST", "/tasks", args))
);

server.registerTool(
  "update_task",
  {
    description:
      "Change a task: edit its fields, reassign it, move its status, or mark it blocked. " +
      "assignedTo replaces the whole list. Send only what changes.",
    inputSchema: {
      taskId: z.string(),
      title: z.string().max(200).optional(),
      description: z.string().optional(),
      assignedTo: z.array(z.string()).optional(),
      dueDate: dateKey.nullable().optional().describe("null clears the due date"),
      milestone: z.string().optional(),
      status: status.optional(),
      isBlocked: z.boolean().optional(),
      blockedReason: z.string().optional(),
    },
  },
  tool(({ taskId, ...changes }) => api("PATCH", `/tasks/${encodeURIComponent(taskId)}`, changes))
);

server.registerTool(
  "add_task_note",
  {
    description:
      "Add a note to a task. Use it to report progress or the result of work you did on the task.",
    inputSchema: { taskId: z.string(), content: z.string().max(5000) },
  },
  tool(({ taskId, content }) =>
    api("POST", `/tasks/${encodeURIComponent(taskId)}/notes`, { content })
  )
);

server.registerTool(
  "list_members",
  {
    description: "People in the workspace with their ids, for assigning tasks.",
    inputSchema: {},
  },
  tool(() => api("GET", "/members"))
);

server.registerTool(
  "list_projects",
  {
    description: "Projects in the workspace with their ids. Every task belongs to one.",
    inputSchema: { includeArchived: z.boolean().optional() },
  },
  tool(({ includeArchived }) => api("GET", `/projects${includeArchived ? "?includeArchived=true" : ""}`))
);

/* ------------------------------------------------------------------ */
/*  Calendar                                                           */
/*                                                                     */
/*  Booking, rescheduling and cancelling mail real invitations, so     */
/*  each of those tools says so in its description — the model should */
/*  confirm with the person before calling them.                       */
/* ------------------------------------------------------------------ */

/** This machine's zone. The assistant runs here, so "3pm" means 3pm here. */
const LOCAL_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const isoTime = z
  .string()
  .describe(`An ISO date-time with offset, e.g. 2026-10-20T15:00:00+02:00. Local zone: ${LOCAL_ZONE}`);

const guest = z.object({ email: z.string().email(), name: z.string().optional() });

server.registerTool(
  "list_meetings",
  {
    description:
      "Meetings I am invited to between two times (default: the next 7 days), earliest first, " +
      "with everyone's RSVP and the join link. Use scope='all' for the whole workspace. Max 62 days.",
    inputSchema: {
      from: isoTime.optional(),
      to: isoTime.optional(),
      scope: z.enum(["me", "all"]).optional(),
      includeCancelled: z.boolean().optional(),
    },
  },
  tool(({ from, to, scope, includeCancelled }) => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (scope) params.set("scope", scope);
    if (includeCancelled) params.set("includeCancelled", "true");
    const query = params.toString();
    return api("GET", `/events${query ? `?${query}` : ""}`);
  })
);

server.registerTool(
  "get_meeting",
  {
    description: "Full details of one meeting: time, place, join link, attendees and guests with their RSVP.",
    inputSchema: { eventId: z.string() },
  },
  tool(({ eventId }) => api("GET", `/events/${encodeURIComponent(eventId)}`))
);

server.registerTool(
  "find_free_time",
  {
    description:
      "Find slots when I and the given members are all free, inside working hours. " +
      "Use before book_meeting. Window up to 60 days.",
    inputSchema: {
      attendees: z.array(z.string()).describe("Member ids from list_members; I am always included"),
      from: isoTime,
      to: isoTime,
      durationMins: z.number().int().min(5).max(1440),
      bufferMins: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(50).optional(),
    },
  },
  tool((args) => api("POST", "/availability", args))
);

server.registerTool(
  "book_meeting",
  {
    description:
      "Book a meeting. SENDS INVITATION EMAILS to every attendee and guest as soon as it is booked, " +
      "so confirm the details with me first. callProvider 'orbit' hosts the call in OrbitOS; " +
      "'external' needs meetingUrl; 'none' is in person. Guests are people outside the workspace (paid plans).",
    inputSchema: {
      title: z.string().max(140),
      startAt: isoTime,
      endAt: isoTime,
      description: z.string().max(1000).optional(),
      attendees: z.array(z.string()).optional().describe("Member ids; I am added automatically"),
      guests: z.array(guest).optional(),
      callProvider: z.enum(["orbit", "external", "none"]).optional(),
      meetingUrl: z.string().url().optional(),
      location: z.string().max(200).optional(),
      projectId: z.string().optional(),
      allDay: z.boolean().optional(),
      timeZone: z.string().optional().describe(`IANA zone, default ${LOCAL_ZONE}`),
    },
  },
  tool((args) =>
    api("POST", "/events", { projectId: null, ...args, timeZone: args.timeZone || LOCAL_ZONE })
  )
);

server.registerTool(
  "update_meeting",
  {
    description:
      "Reschedule or edit a meeting I organised. A new time, place or title RE-SENDS INVITATIONS " +
      "to everyone; removing someone sends them a cancellation. attendees and guests replace the whole list.",
    inputSchema: {
      eventId: z.string(),
      title: z.string().max(140).optional(),
      startAt: isoTime.optional(),
      endAt: isoTime.optional(),
      description: z.string().max(1000).optional(),
      attendees: z.array(z.string()).optional(),
      guests: z.array(guest).optional(),
      callProvider: z.enum(["orbit", "external", "none"]).optional(),
      meetingUrl: z.string().url().optional(),
      location: z.string().max(200).nullable().optional(),
      timeZone: z.string().optional(),
    },
  },
  tool(({ eventId, ...changes }) =>
    api("PATCH", `/events/${encodeURIComponent(eventId)}`, changes)
  )
);

server.registerTool(
  "cancel_meeting",
  {
    description:
      "Cancel a meeting I organised. EMAILS A CANCELLATION to everyone on it. Confirm with me first.",
    inputSchema: { eventId: z.string() },
  },
  tool(({ eventId }) => api("POST", `/events/${encodeURIComponent(eventId)}/cancel`))
);

server.registerTool(
  "rsvp_meeting",
  {
    description: "Answer a meeting invitation for me. The organiser is notified.",
    inputSchema: {
      eventId: z.string(),
      status: z.enum(["accepted", "declined", "tentative"]),
    },
  },
  tool(({ eventId, status }) =>
    api("POST", `/events/${encodeURIComponent(eventId)}/rsvp`, { status })
  )
);

/* ------------------------------------------------------------------ */
/*  Reports                                                            */
/* ------------------------------------------------------------------ */

server.registerTool(
  "report_my_week",
  {
    description:
      "My next 7 days in one call: overdue tasks (with days late), tasks due this week, " +
      "blocked tasks, how many are in progress, how many I finished in the last 7 days, and my meetings. " +
      "Start here for 'how's my week' or a morning briefing.",
    inputSchema: {},
  },
  tool(() => api("GET", "/reports/my-week"))
);

server.registerTool(
  "report_attention",
  {
    description:
      "What is slipping across the workspace, or in one project: overdue, blocked, " +
      "unassigned, and stalled tasks (in progress with no update for 3+ days).",
    inputSchema: { projectId: z.string().optional() },
  },
  tool(({ projectId }) =>
    api("GET", `/reports/attention${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`)
  )
);

server.registerTool(
  "report_month",
  {
    description:
      "Workspace health for a month (default: this month so far): completed vs last month, " +
      "created, due, on time, missed, overdue, blocked, top contributors, and per-project health. " +
      "Workspace owners only.",
    inputSchema: {
      month: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("YYYY-MM"),
    },
  },
  tool(({ month }) => api("GET", `/reports/month${month ? `?month=${month}` : ""}`))
);

await server.connect(new StdioServerTransport());
