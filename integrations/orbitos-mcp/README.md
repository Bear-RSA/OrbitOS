# orbitos-mcp

Connects a local AI assistant to OrbitOS. It runs on your machine and gives the assistant tools to manage your tasks and your calendar, and to pull reports.

## Setup

1. In OrbitOS, open **Settings → AI access** and create a token. Copy it; it is shown once.
2. Install the dependencies:
   ```
   cd integrations/orbitos-mcp
   npm install
   ```
3. Add the server to your assistant's MCP settings (Claude Desktop, LM Studio, Open WebUI, and others):
   ```json
   {
     "mcpServers": {
       "orbitos": {
         "command": "node",
         "args": ["C:/full/path/to/integrations/orbitos-mcp/index.mjs"],
         "env": {
           "ORBITOS_URL": "https://your-orbitos-domain",
           "ORBITOS_TOKEN": "orb_..."
         }
       }
     }
   }
   ```
4. Restart the assistant and ask it: "What tasks are assigned to me in OrbitOS?"

## Tools

| Tool | What it does |
|---|---|
| `whoami` | Confirms the connection and who it acts as |
| `list_tasks` | Your open tasks by default; filter by status, project or person |
| `get_task` | One task with its description, assignees and notes |
| `create_task` | New task in a project, with assignees and a due date |
| `update_task` | Edit, reassign, change status, mark blocked |
| `add_task_note` | Report progress or results on a task |
| `list_members` | People and their ids, for assigning |
| `list_projects` | Projects and their ids, for creating tasks |
| `list_meetings` | Your meetings in a window (default: next 7 days) |
| `get_meeting` | One meeting with attendees, RSVPs and join link |
| `find_free_time` | Slots when you and chosen members are all free |
| `book_meeting` | Book a meeting. **Sends invitation emails** |
| `update_meeting` | Reschedule or edit one you organised. **Re-sends invitations** |
| `cancel_meeting` | Cancel one you organised. **Emails a cancellation** |
| `rsvp_meeting` | Accept, decline or tentatively accept |
| `report_my_week` | Overdue, due this week, blocked, and meetings, in one call |
| `report_attention` | Overdue, blocked, unassigned and stalled work, workspace or one project |
| `report_month` | Monthly health numbers (owners only) |

Nothing here can delete. A read-only token gets a clear error on any change. Only the organiser (or an owner) can edit or cancel a meeting, the same as in the app. Times default to this machine's timezone.

## Limits

These come from the OrbitOS server and apply to every token:

- 60 requests a minute
- 500 changes a day
- Paid plans only

## Without MCP

Call the API directly with `Authorization: Bearer <token>`:

```
GET    /api/v1/me
GET    /api/v1/tasks?assignee=me|all|<memberId>&status=todo|doing|done&projectId=&includeDone=true&limit=50
POST   /api/v1/tasks                 { projectId, title, description?, assignedTo?, dueDate?, milestone? }
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id             { title?, description?, assignedTo?, dueDate?, milestone?, status?, isBlocked?, blockedReason? }
POST   /api/v1/tasks/:id/notes       { content }
GET    /api/v1/members
GET    /api/v1/projects
GET    /api/v1/events?from=&to=&scope=me|all&includeCancelled=true
POST   /api/v1/events                { title, startAt, endAt, timeZone?, attendees?, guests?, callProvider?, meetingUrl?, location?, description?, projectId?, allDay? }
GET    /api/v1/events/:id
PATCH  /api/v1/events/:id            { any field from POST }
POST   /api/v1/events/:id/cancel
POST   /api/v1/events/:id/rsvp       { status: accepted|declined|tentative }
POST   /api/v1/availability          { attendees, from, to, durationMins, bufferMins?, limit? }
GET    /api/v1/reports/my-week
GET    /api/v1/reports/attention?projectId=
GET    /api/v1/reports/month?month=YYYY-MM   (owners only)
```
