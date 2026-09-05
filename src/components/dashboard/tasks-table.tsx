"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import { format } from "date-fns";
import { Plus, Pencil, ChevronDown, ChevronRight, Check, CheckCircle2, ListChecks } from "lucide-react";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog";
import { DeleteTaskDialog } from "@/components/tasks/delete-task-dialog";
import { ForwardTaskDialog } from "@/components/tasks/forward-task-dialog";
import { addTaskNoteAction, updateTaskStatusAction, toggleTaskBlockedAction, deleteTaskAction } from "@/app/actions/tasks";
import { cn } from "@/lib/utils/classnames";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { UserAvatar } from "@/components/ui/user-avatar";
import { recordTelemetryAction } from "@/app/actions/telemetry";
import { syncOperationalStatusAction } from "@/app/actions/personnel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TasksTableProps {
  tasks: Task[];
  selectedAssignee?: string | null;
  onClearFilter?: () => void;
  members: Member[];
  currentUserId: string;
  orgId: string;
  projectId: string;
  onTaskUpdated: () => void;
}

export function TasksTable({
  tasks: allTasks,
  selectedAssignee,
  onClearFilter,
  members,
  currentUserId,
  orgId,
  projectId,
  onTaskUpdated,
}: TasksTableProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [activeNoteInputId, setActiveNoteInputId] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [deletingTask, setDeletingTask] = useState<Task | null>(null);
  /* The directive being sent into a chat. Held here rather than per row
     so one dialog serves the whole checklist — a picker mounted under
     every node would open a conversation listener for each one. */
  const [forwardingTask, setForwardingTask] = useState<Task | null>(null);

  /* Which half of the checklist is on screen.
     
     Executed directives leave the master list rather than sitting in it
     greyed out. A finished node is not a lighter version of an open one
     — it is a different question ("what did we do") from the one the
     list is meant to answer ("what is left"), and a month of them
     between you and today's work is a list you stop reading. They keep
     the grey and the strikethrough once you go looking for them, where
     the styling means "closed" instead of "ignore me". */
  const [view, setView] = useState<"active" | "completed">("active");

  const reducedMotion = useReducedMotion();

  /* Arriving from a forwarded card. The link carries `#task-<id>`, and
     a row that merely scrolls into view still hides everything the card
     promised — status, scope, the notes — behind a chevron. So the
     anchor opens the node as well as finding it.

     Once, and the latch is what makes it once. The effect has to wait
     for `allTasks` to arrive before it can find the row, and that array
     is replaced on every snapshot — without the latch, any task update
     would re-open a node the reader had since collapsed. The hash is
     how you got here, not state to keep in sync. */
  const arrivedAt = useRef(false);

  useEffect(() => {
    if (arrivedAt.current || typeof window === "undefined") return;

    const match = window.location.hash.match(/^#task-(.+)$/);
    if (!match) return;

    const taskId = decodeURIComponent(match[1]);
    const target = allTasks.find((t) => t.id === taskId);
    if (!target) return;

    arrivedAt.current = true;

    /* A forwarded card may point at something already executed, and that
       row is not in the master list any more. Land on the view that
       actually holds it, or the link goes nowhere. */
    if (target.status === "done") setView("completed");

    setExpandedTasks((prev) => (prev[taskId] ? prev : { ...prev, [taskId]: true }));

    /* Two frames: one for the view switch and the expand to commit, one
       for the row to be laid out. Scrolling in the first would aim at
       where the row used to be, or at nothing at all. */
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        document.getElementById(`task-${taskId}`)?.scrollIntoView({
          block: "center",
          /* JS-driven motion, so CSS cannot reach it — see
             `hooks/use-reduced-motion`. */
          behavior: reducedMotion ? "auto" : "smooth",
        });
      });
    });

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [allTasks, reducedMotion]);

  const getMemberName = (memberId: string | null) => {
    return members.find((m) => m.id === memberId || (m as any).uid === memberId)?.name ?? "Unknown";
  };

  const handleStatusChange = async (task: Task, newStatus: Task["status"], milestoneName: string, tasksInMilestone: Task[]) => {
    const prevStatus = task.status;
    if (newStatus === prevStatus) return;

    const msTotal = tasksInMilestone.length;
    const msDone = tasksInMilestone.filter(t => t.status === "done").length;
    const isCompletingMilestone = newStatus === "done" && prevStatus !== "done" && msDone === msTotal - 1;

    const actorName = getMemberName(currentUserId);
    try {
      const result = await updateTaskStatusAction({
        taskId: task.id,
        status: newStatus,
        previousStatus: prevStatus,
        uid: currentUserId,
      });
      if (!result.success) throw new Error(result.error);
      
      // Update UI immediately
      onTaskUpdated();
      
      if (task.assignedTo && task.assignedTo.length > 0) {
        task.assignedTo.forEach(uid => {
          syncOperationalStatusAction(uid, orgId).catch(err => console.error("[Sync Error]:", err));
        });
      }

      // DIRECTIVE_TRANSITION is logged by updateTaskStatusAction itself —
      // see the note atop actions/tasks.ts. Milestones are not, so that one
      // stays here as background telemetry.
      if (newStatus === "done" && isCompletingMilestone) {
        recordTelemetryAction({
          eventType: "MILESTONE_COMPLETE",
          orgId,
          projectId,
          actor: { uid: currentUserId, name: actorName },
          metadata: { milestone: milestoneName }
        }).catch(err => console.error("[Telemetry Error]:", err));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleBlocked = async (taskId: string, currentBlocked: boolean, taskTitle: string) => {
    try {
      const result = await toggleTaskBlockedAction({
        taskId,
        isBlocked: !currentBlocked,
        uid: currentUserId,
      });
      if (!result.success) throw new Error(result.error);
      
      // Update UI immediately
      onTaskUpdated();

      // Background telemetry
      const actorName = getMemberName(currentUserId);
      recordTelemetryAction({
        eventType: currentBlocked ? "DIRECTIVE_UNBLOCKED" : "DIRECTIVE_BLOCKED",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: actorName },
        metadata: { taskTitle }
      }).catch(err => console.error("[Telemetry Error]:", err));
    } catch (err) {
      console.error("Failed to toggle blocked state:", err);
    }
  };

  const handleDeleteTask = async (task: Task) => {
    try {
      const result = await deleteTaskAction({
        taskId: task.id,
        uid: currentUserId,
      });
      if (!result.success) throw new Error(result.error);
      
      // Update UI immediately
      onTaskUpdated();

      // Background telemetry
      const actorName = getMemberName(currentUserId);
      recordTelemetryAction({
        eventType: "DIRECTIVE_DELETED",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: actorName },
        metadata: { taskTitle: task.title }
      }).catch(err => console.error("[Telemetry Error]:", err));
    } catch (err) {
      console.error("Failed to delete task:", err);
      throw err; // Re-throw to handle in the dialog
    }
  };

  /* Everything the assignee filter lets through, both statuses.
     Milestone completion is counted against THIS rather than against
     what is on screen — a milestone is finished when all of its nodes
     are done, and asking that of a list with the done ones filtered out
     would make the answer either always true or never. */
  const scoped = selectedAssignee 
    ? allTasks.filter(t => t.assignedTo.includes(selectedAssignee))
    : allTasks;

  const completedCount = scoped.filter(t => t.status === "done").length;

  const tasks = scoped.filter(t =>
    view === "completed" ? t.status === "done" : t.status !== "done"
  );

  const showingCompleted = view === "completed";

  const sortTasks = (taskList: Task[]) => {
    return [...taskList].sort((a, b) => {
      const aIsDone = a.status === "done";
      const bIsDone = b.status === "done";
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1;

      const getH = (t: any) => {
        const d = t.dueDate || t.horizon;
        if (!d) return null;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        return new Date(d).getTime();
      };

      const getR = (t: any) => {
        const d = t.updatedAt || t.completedAt || t.createdAt;
        if (!d) return 0;
        if (typeof d.toMillis === 'function') return d.toMillis();
        if (typeof d.toDate === 'function') return d.toDate().getTime();
        return new Date(d).getTime();
      };

      if (!aIsDone) {
        const aT = getH(a);
        const bT = getH(b);
        if (aT === null && bT === null) return getR(b) - getR(a);
        if (aT === null) return 1;
        if (bT === null) return -1;
        return aT - bT;
      } else {
        return getR(b) - getR(a);
      }
    });
  };

  const sortedTasks = sortTasks(tasks);

  return (
    <div className="animate-fade-in py-6 bg-transparent">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-8">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-ink-dim mb-3">
            Operational Log
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {/* The heading is the label for what is on screen, so it
                changes with the view. The button opposite always names
                where it goes, never where you are. */}
            <h3 className="text-2xl font-light text-ink tracking-tight">
              {showingCompleted ? "Completed Objectives" : "Master Objective List"}
            </h3>
            <span className="hidden h-4 w-px bg-surface-control sm:block" />
            <span className="text-[12px] text-ink-dim font-mono tabular-nums">
              {tasks.length} {showingCompleted ? "Nodes Executed" : "Nodes Registered"}
              {selectedAssignee && ` [FILTERED: ${getMemberName(selectedAssignee)}]`}
            </span>
            {selectedAssignee && (
              <button
                onClick={onClearFilter}
                className="text-[10px] font-mono uppercase tracking-widest text-orbit-amber hover:text-ink-strong transition-colors ml-2"
              >
                [Clear Signal]
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { setCreateOpen(true); }}
            disabled={!projectId}
            title={!projectId ? "Create a project first" : "Create Task"}
            className="flex items-center justify-center gap-2.5 bg-surface-control hover:bg-surface-control text-ink shadow-[inset_0_1px_0_rgb(var(--ink-strong)_/_0.06),0_2px_8px_rgb(var(--scrim)_/_0.3)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:shadow-[inset_0_1px_0_rgb(var(--ink-strong)_/_0.08),0_4px_16px_rgb(var(--scrim)_/_0.4)] border-0 rounded-lg px-5 h-9 text-[12px] font-medium focus:outline-none ring-0 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Plus className="w-3.5 h-3.5 text-ink-dim group-hover:text-ink-muted transition-colors duration-300" />
            Insert Directive
          </button>

          {/* One button, both directions — it names the destination, so
              it reads as a place to go rather than a state to decode.
              Quieter than Insert Directive on purpose: creating work is
              the primary act on this screen, reviewing finished work is
              the occasional one.

              The tally rides on the label rather than sitting in the
              heading, because it is the reason to press it: "3" is what
              tells you there is anything through there. */}
          <button
            onClick={() => setView(showingCompleted ? "active" : "completed")}
            aria-pressed={showingCompleted}
            title={
              showingCompleted
                ? "Back to the directives still open"
                : "Review the directives already executed"
            }
            className="group flex h-9 items-center justify-center gap-2.5 rounded-lg border border-line/[0.06] bg-transparent px-5 text-[12px] font-medium text-ink-muted transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-line/[0.12] hover:bg-surface-card hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {showingCompleted ? (
              <ListChecks className="h-3.5 w-3.5 text-ink-dim transition-colors duration-300 group-hover:text-ink-muted" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-ink-dim transition-colors duration-300 group-hover:text-orbit-green" />
            )}
            {showingCompleted ? "Master Objective List" : "Completed Objectives"}
            {!showingCompleted && completedCount > 0 && (
              <span className="font-mono text-[10px] tabular-nums text-ink-dim">
                {completedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Two columns only — no min-width. A min-width here forced the whole
          checklist (rows and the expanded detail panel alike) into a sideways
          scroller on a phone, so half of every directive sat off-screen. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-line/[0.05]">
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-ink-dim w-[75%]">
                Directive
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-ink-dim w-[25%] text-right">
                Horizon
              </th>
            </tr>
          </thead>
          <tbody>
            {!tasks || tasks.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-16 text-center">
                  {/* Three empty states, not one. "No directives listed"
                      under Completed Objectives would read as though the
                      project had nothing in it at all, when the truth is
                      that nothing has been finished yet. */}
                  <p className="text-[14px] font-medium text-ink mb-1 font-mono">
                    {showingCompleted
                      ? "No objectives executed yet."
                      : selectedAssignee ? "No nodes matching current frequency." : "All directives cleared."}
                  </p>
                  <p className="text-[13px] text-ink-muted font-light mt-1 font-mono">
                    {showingCompleted
                      ? selectedAssignee
                        ? "The selected operator has closed nothing in this sector."
                        : "Directives land here once they are marked executed."
                      : selectedAssignee 
                        ? "The selected operator has no open directives in this sector."
                        : projectId
                          ? completedCount > 0
                            /* Not the same as an empty project: everything
                               that existed has been done, and the button
                               opposite is where it went. */
                            ? "Nothing open. The executed ones are under Completed Objectives."
                            : "Append your first directive to begin."
                          : "Initialize a project first."}
                  </p>
                  {selectedAssignee && (
                    <button
                      onClick={onClearFilter}
                      className="mt-6 text-[11px] font-mono uppercase tracking-widest text-orbit-amber border border-orbit-amber/20 px-4 py-2 rounded-md hover:bg-orbit-amber/5 transition-all"
                    >
                      Clear Filter Signal
                    </button>
                  )}
                </td>
              </tr>
            ) : (
              sortedTasks.map((task, index) => {
                const rawDate = task.dueDate || (task as any).horizon;
                let horizonText = "—";
                let horizonSubText = "";
                let horizonColor = "text-ink-dim group-hover/row:text-ink-muted";

                if (rawDate) {
                  const dueDate = typeof rawDate.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const due = new Date(dueDate);
                  due.setHours(0, 0, 0, 0);
                  const daysDiff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                  if (task.status === "done") {
                      horizonText = format(dueDate, "dd MMM yyyy");
                      horizonColor = "text-ink-dim";
                  } else if (daysDiff < 0) {
                      horizonText = `Overdue by ${Math.abs(daysDiff)}d`;
                      horizonColor = "text-orbit-red font-semibold";
                      horizonSubText = format(dueDate, "dd MMM yyyy");
                  } else if (daysDiff === 0) {
                      horizonText = "Due Today";
                      horizonColor = "text-orbit-amber font-medium";
                      horizonSubText = format(dueDate, "dd MMM");
                  } else if (daysDiff === 1) {
                      horizonText = "Due Tomorrow";
                      horizonColor = "text-ink font-medium";
                      horizonSubText = format(dueDate, "dd MMM");
                  } else {
                      horizonText = `Due ${format(dueDate, "dd MMM")}`;
                      horizonSubText = format(dueDate, "yyyy");
                      horizonColor = "text-ink-muted";
                  }
                }

                const canEdit = true; // Full operational clearance for all org members
                const canAddNote = true;
                const isDone = task.status === "done";
                const isExpanded = expandedTasks[task.id];
                const taskId = task.id.slice(0, 4).toUpperCase();
                
                const getPersonnelWorkload = (uid: string) => {
                  const personnelTasks = allTasks.filter(t => t.assignedTo.includes(uid) && t.status !== "done");
                  const count = personnelTasks.length;
                  const segments = 10;
                  const active = Math.min(count, segments);
                  return { count, bar: `[${"|".repeat(active)}${"-".repeat(segments - active)}]` };
                };

                return (
                  <Fragment key={task.id}>
                    <tr
                      id={`task-${task.id}`}
                      className={cn(
                        "row-enter group/row transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-b border-line/[0.02] last:border-b-0 cursor-pointer font-mono",
                        /* Grey and struck through in both views, but not
                           equally faint. In the master list the 40% is
                           there to push a finished node out of the way of
                           live ones. Under Completed Objectives there is
                           nothing to push it behind — every row is done —
                           so the same 40% just makes the whole page hard
                           to read. The grey and the line still say
                           "closed" at an opacity you can actually read. */
                        isDone && (showingCompleted
                          ? "opacity-70 hover:opacity-100 hover:bg-surface-card"
                          : "opacity-40 grayscale-[0.5]"),
                        task.isBlocked && !isDone && "bg-orbit-red/[0.03]",
                        !task.isBlocked && !isDone && "hover:bg-surface-card",
                        isExpanded && "bg-surface-sunken"
                      )}
                      style={{ animationDelay: `${index * 60}ms` }}
                      onClick={() => setExpandedTasks(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                    >
                      <td className="py-4 pr-3 pl-1 align-top sm:pr-6 sm:pl-2">
                        <div className="flex items-center gap-2.5 sm:gap-4">
                          <button className="shrink-0 p-1 hover:bg-surface-control rounded-md transition-colors">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-ink-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-ink-dim" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-[14px] font-medium tracking-tight leading-snug break-words",
                              isDone ? "text-ink-dim line-through decoration-line/10" : "text-ink group-hover/row:text-ink-strong transition-colors duration-300"
                            )}>
                              {task.title}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pl-1 text-right align-top sm:pl-4">
                        {task.dueDate ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn("text-[11px] uppercase tracking-widest tabular-nums transition-colors duration-300", horizonColor)}>
                              {horizonText}
                            </span>
                            {horizonSubText && <span className="text-[8px] uppercase tracking-[0.2em] text-ink-dim">{horizonSubText}</span>}
                          </div>
                        ) : <span className="text-[11px] text-ink-dim">—</span>}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="p-0">
                        <div className={cn(
                          "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          isExpanded ? "max-h-[1600px] opacity-100 mb-8 mx-0 mt-2 sm:mx-2" : "max-h-0 opacity-0"
                        )}>
                          <div className="border border-line/[0.06] bg-surface-card/40 backdrop-blur-sm p-4 sm:p-5 font-mono shadow-raised rounded-xl ring-1 ring-line/5">
                            {/* Node handle — kept out of the collapsed row to keep the
                                list clean, but still quotable once a node is opened. */}
                            <div className="mb-4 text-[9px] uppercase tracking-[0.3em] text-ink-dim">
                              {/* The trailing slashes are decoration. As a bare text
                                  child they read as an unwrapped comment and fail
                                  the build under react/jsx-no-comment-textnodes. */}
                              Node #{taskId} {"//"}
                            </div>
                            <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                              <div className="flex items-center gap-4">
                                <button
                                  disabled={!canEdit}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    const msTasks = task.milestone ? scoped.filter(t => t.milestone === task.milestone) : scoped;
                                    handleStatusChange(task, isDone ? "todo" : "done", task.milestone || "Global", msTasks); 
                                  }}
                                  className={cn(
                                    "w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all duration-300",
                                    isDone ? "bg-orbit-green border-orbit-green" : "bg-surface-card border-line/[0.12] hover:border-line/[0.25]",
                                    canEdit && "cursor-pointer", !canEdit && "opacity-50 cursor-not-allowed"
                                  )}
                                >
                                  {isDone && <Check className="w-3.5 h-3.5 text-background stroke-[3]" />}
                                </button>
                                <div className="h-4 w-px bg-surface-control" />
                                <Select 
                                  value={task.status} 
                                  onValueChange={(val: Task["status"]) => {
                                    const msTasks = task.milestone ? scoped.filter(t => t.milestone === task.milestone) : scoped;
                                    handleStatusChange(task, val, task.milestone || "Global", msTasks);
                                  }} 
                                  disabled={!canEdit}
                                >
                                  <SelectTrigger className="h-7 w-[140px] bg-surface-card border-line/[0.06] text-[10px] uppercase tracking-[0.2em] text-ink focus:ring-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-surface-card border-line/[0.06] text-ink">
                                    <SelectItem value="todo" className="font-mono text-[9px] uppercase tracking-[0.2em] focus:bg-surface-control focus:text-ink-strong">IDLE</SelectItem>
                                    <SelectItem value="doing" className="font-mono text-[9px] uppercase tracking-[0.2em] focus:bg-surface-control focus:text-ink-strong">ACTIVE</SelectItem>
                                    <SelectItem value="done" className="font-mono text-[9px] uppercase tracking-[0.2em] focus:bg-surface-control focus:text-ink-strong text-orbit-green">EXECUTED</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); setActiveNoteInputId(task.id); setNoteContent(""); }} className="px-2 py-1 rounded bg-surface-card text-ink-dim border border-line/[0.05] hover:text-ink-muted hover:border-line/[0.1] text-[9px] uppercase tracking-widest transition-all">
                                  [ADD NOTE]
                                </button>
                                {/* Open to everyone, on purpose. Anyone who can
                                    see a directive can ask about it — where it
                                    may land is the only thing gated, and that
                                    decision stays in the dialog. */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setForwardingTask(task); }}
                                  title="Send this directive into a chat"
                                  className="px-2 py-1 rounded bg-surface-card text-ink-dim border border-line/[0.05] hover:text-ink-muted hover:border-line/[0.1] text-[9px] uppercase tracking-widest transition-all"
                                >
                                  [DISCUSS]
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEditingTask(task); }} 
                                  className="px-2 py-1 rounded bg-surface-card text-ink-dim border border-line/[0.05] hover:text-ink-muted hover:border-line/[0.1] text-[9px] uppercase tracking-widest transition-all"
                                >
                                  [AMEND]
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setDeletingTask(task); }} 
                                  className="px-2 py-1 rounded bg-surface-card text-orbit-red/50 border border-line/[0.05] hover:text-orbit-red hover:border-orbit-red/20 text-[9px] uppercase tracking-widest transition-all"
                                >
                                  [REMOVE]
                                </button>
                              </div>
                            </div>
                            <div className="mb-8">
                              <h4 className="text-[9px] text-ink-dim uppercase tracking-[0.3em] mb-2">Scope Documentation //</h4>
                              <p className="text-[12px] text-ink-muted leading-relaxed max-w-2xl whitespace-pre-wrap break-words">{task.description || "No documentation registered for this node."}</p>
                            </div>
                            <div className="mb-8 flex flex-col gap-3">
                              <h4 className="text-[9px] text-ink-dim uppercase tracking-[0.3em]">Operative Assignment //</h4>
                              <div className="flex flex-col gap-3">
                                {task.assignedTo.length > 0 ? (
                                  task.assignedTo.map(uid => {
                                    const workload = getPersonnelWorkload(uid);
                                    return (
                                      <div key={uid} className="flex items-center gap-4 border border-line/[0.06] rounded-lg px-3 py-2 bg-surface-card">
                                        <UserAvatar photoURL={members.find(m => m.id === uid)?.photoURL} name={getMemberName(uid)} size="sm" />
                                        <div className="flex flex-col gap-1">
                                          <span className="text-[11px] text-ink uppercase tracking-widest font-medium font-mono">{getMemberName(uid)}</span>
                                          <span className="text-[10px] text-orbit-green tracking-tighter font-mono">{workload.bar}</span>
                                        </div>
                                      </div>
                                    );
                                  })
                                ) : <span className="text-[10px] text-ink-dim italic uppercase font-mono">Unassigned Frequency</span>}
                              </div>
                            </div>


                            <div className="mb-8">
                              <h4 className="text-[9px] text-ink-dim uppercase tracking-[0.3em] mb-4">Task Notes //</h4>
                              
                              {task.taskNotes && task.taskNotes.length > 0 ? (
                                <div className="space-y-2 mb-4">
                                  {task.taskNotes.slice().sort((a, b) => {
                                    const getT = (t: any) => t?.toMillis ? t.toMillis() : new Date(t).getTime();
                                    return getT(a.createdAt) - getT(b.createdAt);
                                  }).map((note) => (
                                    <div key={note.id} className="flex flex-col gap-1 border-l-2 border-line/[0.06] pl-3 py-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-ink-dim tabular-nums">{format(typeof (note.createdAt as any).toDate === 'function' ? (note.createdAt as any).toDate() : new Date(note.createdAt as any), "dd MMM HH:mm")}</span>
                                        <span className="text-[9px] text-orbit-green uppercase tracking-widest">{getMemberName(note.createdBy)}</span>
                                      </div>
                                      <p className="text-[11px] text-ink-muted font-mono whitespace-pre-wrap break-words">{note.content}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-ink-dim italic mb-4">No operational notes recorded.</p>
                              )}

                              {activeNoteInputId === task.id && (
                                <div className="flex flex-col gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                  <textarea
                                    className="w-full bg-surface-card border border-line/[0.06] rounded p-2 text-[11px] text-ink font-mono focus:outline-none focus:border-line/[0.16] resize-none"
                                    rows={2}
                                    placeholder="Enter operational note..."
                                    value={noteContent}
                                    onChange={(e) => setNoteContent(e.target.value)}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      className="px-3 py-1 text-[9px] uppercase tracking-widest text-ink-dim hover:text-ink transition-colors"
                                      onClick={() => { setActiveNoteInputId(null); setNoteContent(""); }}
                                    >
                                      [CANCEL]
                                    </button>
                                    <button
                                      className="px-3 py-1 text-[9px] uppercase tracking-widest bg-surface-control hover:bg-surface-hover text-ink-strong rounded transition-colors"
                                      disabled={!noteContent.trim() || isSubmittingNote}
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        if (!noteContent.trim()) return;
                                        setIsSubmittingNote(true);
                                          try {
                                            const noteResult = await addTaskNoteAction({
                                              taskId: task.id,
                                              content: noteContent.trim(),
                                              createdBy: currentUserId,
                                            });
                                            if (!noteResult.success) {
                                              throw new Error(noteResult.error || "Failed to add note");
                                            }
                                            
                                            // Clear UI immediately for responsiveness
                                            const savedContent = noteContent.trim();
                                            setNoteContent("");
                                            setActiveNoteInputId(null);
                                            onTaskUpdated();

                                            const actorName = getMemberName(currentUserId);
                                            // Background telemetry (fire-and-forget)
                                            recordTelemetryAction({
                                              eventType: "NOTE_ADDED",
                                              orgId,
                                              projectId,
                                              actor: { uid: currentUserId, name: actorName },
                                              metadata: { taskTitle: task.title, content: savedContent }
                                            }).catch(err => console.error("[Telemetry Error]:", err));
                                        } catch (err) {
                                          console.error("Failed to add note", err);
                                        } finally {
                                          setIsSubmittingNote(false);
                                        }
                                      }}
                                    >
                                      {isSubmittingNote ? "[LOGGING...]" : "[LOG NOTE]"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="pt-2">
                              <span className="text-[10px] text-ink-dim tracking-wider uppercase font-mono">
                                {task.assignedTo.length > 0 
                                  ? `[${task.assignedTo.reduce((sum, uid) => sum + getPersonnelWorkload(uid).count, 0)}] tasks across ${task.assignedTo.length} operative${task.assignedTo.length > 1 ? 's' : ''}` 
                                  : "[0] OPERATORS TUNED TO THIS NODE"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgId={orgId}
        projectId={projectId}
        members={members}
        currentUserId={currentUserId}
        onCreated={onTaskUpdated}
      />

      <EditTaskDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(isOpen) => !isOpen && setEditingTask(null)}
        members={members}
        orgId={orgId}
        projectId={projectId}
        currentUserId={currentUserId}
        onUpdated={() => {
          setEditingTask(null);
          onTaskUpdated();
        }}
      />

      {/* The viewer's role decides whether Town Hall is a legal target,
          and the directory already holds it — no second read. */}
      <ForwardTaskDialog
        task={forwardingTask}
        open={!!forwardingTask}
        onOpenChange={(isOpen) => !isOpen && setForwardingTask(null)}
        viewer={{
          id: currentUserId,
          orgId,
          role: members.find((m) => m.id === currentUserId)?.role ?? "MEMBER",
        }}
        members={members}
      />

      <DeleteTaskDialog
        task={deletingTask}
        open={!!deletingTask}
        onOpenChange={(isOpen) => !isOpen && setDeletingTask(null)}
        onConfirm={async () => {
          if (deletingTask) {
            await handleDeleteTask(deletingTask);
          }
        }}
      />
    </div>
  );
}
