import type { MessageTaskRef } from "@/types/message";
import type { TaskStatus } from "@/types/task";
import { MESSAGE_PREVIEW_LENGTH } from "@/lib/validations/messages";

/* ------------------------------------------------------------------ */
/*  Forwarded task cards                                               */
/*                                                                     */
/*  Turning a directive into something a conversation can be about.    */
/*                                                                     */
/*  Pure, for the same reason `lib/messages/access` is: the snapshot   */
/*  the server writes and the card the thread draws have to agree      */
/*  about what a forwarded task looks like, and the left rail has to   */
/*  describe it the same way the thread does. One place decides.       */
/*                                                                     */
/*  Nothing here reads Firestore. `forwardTaskAction` gathers the      */
/*  task and the names; these shape them.                              */
/* ------------------------------------------------------------------ */

/**
 * Titles are capped at 100 in `lib/validations/task`, but a document
 * written before that cap — or by a future path that raises it — must
 * not become an unbounded string on every participant's listener.
 */
export const MAX_TASK_REF_TITLE_LENGTH = 140;

/** Two operatives is the assignment cap; the extra room is slack. */
const MAX_ASSIGNEE_NAMES = 8;

const STATUSES: readonly TaskStatus[] = ["todo", "doing", "done"];

/**
 * What each status is called on a card.
 *
 * The words the checklist already uses. A card that says "todo" while
 * the directive it points at says IDLE reads as two different systems.
 */
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Idle",
  doing: "Active",
  done: "Executed",
};

function clamp(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/**
 * A title that is safe to draw on a card.
 *
 * The fallback is applied AFTER flattening, not before. A title of
 * nothing but whitespace is truthy, so checking first leaves an empty
 * string on the card — and `isValidTaskRef` then refuses it, which
 * would drop the message out of the thread entirely.
 */
function cardTitle(value: string): string {
  return clamp(value, MAX_TASK_REF_TITLE_LENGTH) || "Untitled directive";
}

export interface TaskRefFacts {
  taskId: string;
  projectId: string;
  title: string;
  status: unknown;
  dueDateKey?: string | null;
  isBlocked?: boolean;
  assigneeNames: string[];
}

/**
 * The snapshot that rides on the message.
 *
 * Defensive about `status` because the value comes off a stored
 * document rather than out of a form: a task written by an older path
 * with a status nobody defines any more would otherwise put an unknown
 * key on the card and break the pill that renders it. Unrecognised
 * reads as `todo`, which is the honest guess — it is the state a
 * directive is in before anyone has said otherwise.
 */
export function taskRefFromTask(facts: TaskRefFacts): MessageTaskRef {
  const status = (
    STATUSES.includes(facts.status as TaskStatus) ? facts.status : "todo"
  ) as TaskStatus;

  return {
    taskId: facts.taskId,
    projectId: facts.projectId,
    title: cardTitle(facts.title),
    status,
    dueDateKey: facts.dueDateKey ?? null,
    assigneeNames: facts.assigneeNames.slice(0, MAX_ASSIGNEE_NAMES),
    isBlocked: facts.isBlocked === true,
  };
}

/**
 * What the left rail says about a forwarded task.
 *
 * The note wins when there is one, and the title trails it: the rail
 * has one line to tell somebody why a thread is unread, and "Can you
 * take this?" answers that better than the directive's name. With no
 * note the title is all there is, so it carries the line alone.
 */
export function taskForwardPreview(title: string, note: string): string {
  const trimmed = note.replace(/\s+/g, " ").trim();
  const named = cardTitle(title);
  return clamp(trimmed ? `${trimmed} — ${named}` : `Shared a task: ${named}`,
    MESSAGE_PREVIEW_LENGTH);
}

/**
 * Whether a stored value is a card the thread can draw.
 *
 * The thread renders whatever comes back off the listener, and a
 * half-written reference — a document from before this existed, a
 * shape a later migration got wrong — would otherwise render as an
 * empty box with a dead link in the middle of a conversation.
 */
export function isValidTaskRef(value: unknown): value is MessageTaskRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as Record<string, unknown>;

  if (typeof ref.taskId !== "string" || !ref.taskId) return false;
  if (typeof ref.projectId !== "string" || !ref.projectId) return false;
  if (typeof ref.title !== "string" || !ref.title) return false;
  if (!STATUSES.includes(ref.status as TaskStatus)) return false;
  if (ref.dueDateKey !== null && typeof ref.dueDateKey !== "string") return false;
  if (typeof ref.isBlocked !== "boolean") return false;
  if (!Array.isArray(ref.assigneeNames)) return false;
  if (ref.assigneeNames.some((name) => typeof name !== "string")) return false;

  return true;
}
