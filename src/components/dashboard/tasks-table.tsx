"use client";

import { useState, Fragment } from "react";
import { format } from "date-fns";
import { Plus, Pencil, ChevronDown, ChevronRight, Check } from "lucide-react";
import { Task } from "@/types/task";
import { Member } from "@/types/member";
import { CreateTaskDialog } from "@/components/tasks/create-task-dialog";
import { EditTaskDialog } from "@/components/tasks/edit-task-dialog";
import { DeleteTaskDialog } from "@/components/tasks/delete-task-dialog";
import { addTaskNoteAction, updateTaskStatusAction, toggleTaskBlockedAction, deleteTaskAction } from "@/app/actions/tasks";
import { cn } from "@/lib/utils/classnames";
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
      
      if (task.assignedTo) {
        syncOperationalStatusAction(task.assignedTo, orgId).catch(err => console.error("[Sync Error]:", err));
      }

      // Background telemetry
      recordTelemetryAction({
        eventType: "DIRECTIVE_TRANSITION",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: actorName },
        metadata: { taskTitle: task.title, from: prevStatus, to: newStatus }
      }).catch(err => console.error("[Telemetry Error]:", err));

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
        eventType: "DIRECTIVE_TRANSITION",
        orgId,
        projectId,
        actor: { uid: currentUserId, name: actorName },
        metadata: { taskTitle, from: currentBlocked ? "Blocked" : "Clear", to: !currentBlocked ? "Blocked" : "Clear" }
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

  const tasks = selectedAssignee 
    ? allTasks.filter(t => t.assignedTo === selectedAssignee)
    : allTasks;

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
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444] mb-3">
            Operational Log
          </h2>
          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-light text-[#ededed] tracking-tight">Master Objective List</h3>
            <span className="h-4 w-px bg-white/[0.06]" />
            <span className="text-[12px] text-[#555555] font-mono tabular-nums">
              {tasks.length} Nodes Registered 
              {selectedAssignee && ` [FILTERED: ${getMemberName(selectedAssignee)}]`}
            </span>
            {selectedAssignee && (
              <button
                onClick={onClearFilter}
                className="text-[10px] font-mono uppercase tracking-widest text-orbit-amber hover:text-white transition-colors ml-2"
              >
                [Clear Signal]
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setCreateOpen(true); }}
            disabled={!projectId}
            title={!projectId ? "Create a project first" : "Create Task"}
            className="flex items-center justify-center gap-2.5 bg-[#111111] hover:bg-[#161616] text-[#ededed] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_8px_rgba(0,0,0,0.3)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[1px] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_16px_rgba(0,0,0,0.4)] border-0 rounded-lg px-5 h-9 text-[12px] font-medium focus:outline-none ring-0 disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <Plus className="w-3.5 h-3.5 text-[#666666] group-hover:text-[#aaa] transition-colors duration-300" />
            Insert Directive
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr className="border-b border-white/[0.05]">
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#555555] w-[75%]">
                Directive
              </th>
              <th className="pb-5 pt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#555555] w-[25%] text-right">
                Horizon
              </th>
            </tr>
          </thead>
          <tbody>
            {!tasks || tasks.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-16 text-center">
                  <p className="text-[14px] font-medium text-[#ededed] mb-1 font-mono">
                    {selectedAssignee ? "No nodes matching current frequency." : "No directives listed."}
                  </p>
                  <p className="text-[13px] text-[#888888] font-light mt-1 font-mono">
                    {selectedAssignee 
                      ? "The selected operator has no directives in this sector."
                      : projectId ? "Append your first directive to begin." : "Initialize a project first."}
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
                let horizonColor = "text-[#333333] group-hover/row:text-[#555555]";

                if (rawDate) {
                  const dueDate = typeof rawDate.toDate === 'function' ? rawDate.toDate() : new Date(rawDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const due = new Date(dueDate);
                  due.setHours(0, 0, 0, 0);
                  const daysDiff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                  if (task.status === "done") {
                      horizonText = format(dueDate, "dd MMM yyyy");
                      horizonColor = "text-[#555555]";
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
                      horizonColor = "text-[#ededed] font-medium";
                      horizonSubText = format(dueDate, "dd MMM");
                  } else {
                      horizonText = `Due ${format(dueDate, "dd MMM")}`;
                      horizonSubText = format(dueDate, "yyyy");
                      horizonColor = "text-[#888888]";
                  }
                }

                const canEdit = true; // Full operational clearance for all org members
                const canAddNote = true;
                const isDone = task.status === "done";
                const isExpanded = expandedTasks[task.id];
                const taskId = task.id.slice(0, 4).toUpperCase();
                
                const personnelTasks = task.assignedTo ? allTasks.filter(t => t.assignedTo === task.assignedTo && t.status !== "done") : [];
                const activeCount = personnelTasks.length;
                const workloadSegments = 10;
                const activeSegments = Math.min(activeCount, workloadSegments);
                const workloadBar = `[${"|".repeat(activeSegments)}${"-".repeat(workloadSegments - activeSegments)}]`;

                return (
                  <Fragment key={task.id}>
                    <tr
                      id={`task-${task.id}`}
                      className={cn(
                        "row-enter group/row transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] border-b border-white/[0.02] last:border-b-0 cursor-pointer font-mono",
                        isDone && "opacity-40 grayscale-[0.5]",
                        task.isBlocked && !isDone && "bg-orbit-red/[0.03]",
                        !task.isBlocked && !isDone && "hover:bg-white/[0.02]",
                        isExpanded && "bg-white/[0.01]"
                      )}
                      style={{ animationDelay: `${index * 60}ms` }}
                      onClick={() => setExpandedTasks(prev => ({ ...prev, [task.id]: !prev[task.id] }))}
                    >
                      <td className="py-4 pr-6 pl-2 align-top">
                        <div className="flex items-center gap-4">
                          <button className="p-1 hover:bg-white/[0.05] rounded-md transition-colors">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-[#555]" /> : <ChevronRight className="w-3.5 h-3.5 text-[#555]" />}
                          </button>
                          <span className="text-[10px] text-[#444] tracking-[0.1em] shrink-0">#{taskId}</span>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-[14px] font-medium tracking-tight leading-snug",
                              isDone ? "text-[#555555] line-through decoration-white/10" : "text-[#e0e0e0] group-hover/row:text-white transition-colors duration-300"
                            )}>
                              {task.title}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 pl-4 text-right align-top">
                        {task.dueDate ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn("text-[11px] uppercase tracking-widest tabular-nums transition-colors duration-300", horizonColor)}>
                              {horizonText}
                            </span>
                            {horizonSubText && <span className="text-[8px] uppercase tracking-[0.2em] text-[#555555]">{horizonSubText}</span>}
                          </div>
                        ) : <span className="text-[11px] text-[#444444]">—</span>}
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="p-0">
                        <div className={cn(
                          "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                          isExpanded ? "max-h-[1200px] opacity-100 mb-8 mx-2 mt-2" : "max-h-0 opacity-0"
                        )}>
                          <div className="border border-[#1a1a1a] bg-[#000000]/40 backdrop-blur-sm p-5 font-mono shadow-[0_8px_32px_rgba(0,0,0,0.8)] rounded-xl ring-1 ring-white/5">
                            <div className="flex items-center justify-between mb-8">
                              <div className="flex items-center gap-4">
                                <button
                                  disabled={!canEdit}
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    const msTasks = task.milestone ? tasks.filter(t => t.milestone === task.milestone) : tasks;
                                    handleStatusChange(task, isDone ? "todo" : "done", task.milestone || "Global", msTasks); 
                                  }}
                                  className={cn(
                                    "w-5 h-5 rounded flex items-center justify-center shrink-0 border transition-all duration-300",
                                    isDone ? "bg-[#85C89B] border-[#85C89B]" : "bg-[#050505] border-[#333333] hover:border-[#555555]",
                                    canEdit && "cursor-pointer", !canEdit && "opacity-50 cursor-not-allowed"
                                  )}
                                >
                                  {isDone && <Check className="w-3.5 h-3.5 text-[#000000] stroke-[3]" />}
                                </button>
                                <div className="h-4 w-px bg-white/[0.05]" />
                                <Select 
                                  value={task.status} 
                                  onValueChange={(val: Task["status"]) => {
                                    const msTasks = task.milestone ? tasks.filter(t => t.milestone === task.milestone) : tasks;
                                    handleStatusChange(task, val, task.milestone || "Global", msTasks);
                                  }} 
                                  disabled={!canEdit}
                                >
                                  <SelectTrigger className="h-7 w-[140px] bg-[#0A0A0A] border-[#1a1a1a] text-[10px] uppercase tracking-[0.2em] text-[#ededed] focus:ring-0">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#0A0A0A] border-[#1a1a1a] text-[#ededed]">
                                    <SelectItem value="todo" className="font-mono text-[9px] uppercase tracking-[0.2em] focus:bg-white/[0.05] focus:text-white">IDLE</SelectItem>
                                    <SelectItem value="doing" className="font-mono text-[9px] uppercase tracking-[0.2em] focus:bg-white/[0.05] focus:text-white">ACTIVE</SelectItem>
                                    <SelectItem value="done" className="font-mono text-[9px] uppercase tracking-[0.2em] focus:bg-white/[0.05] focus:text-white text-[#85C89B]">EXECUTED</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={(e) => { e.stopPropagation(); setActiveNoteInputId(task.id); setNoteContent(""); }} className="px-2 py-1 rounded bg-white/[0.02] text-[#555] border border-white/[0.05] hover:text-[#888] hover:border-white/[0.1] text-[9px] uppercase tracking-widest transition-all">
                                  [ADD NOTE]
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setEditingTask(task); }} 
                                  className="px-2 py-1 rounded bg-white/[0.02] text-[#555] border border-white/[0.05] hover:text-[#888] hover:border-white/[0.1] text-[9px] uppercase tracking-widest transition-all"
                                >
                                  [AMEND]
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setDeletingTask(task); }} 
                                  className="px-2 py-1 rounded bg-white/[0.02] text-orbit-red/50 border border-white/[0.05] hover:text-orbit-red hover:border-orbit-red/20 text-[9px] uppercase tracking-widest transition-all"
                                >
                                  [REMOVE]
                                </button>
                              </div>
                            </div>
                            <div className="mb-8">
                              <h4 className="text-[9px] text-[#444] uppercase tracking-[0.3em] mb-2">Scope Documentation //</h4>
                              <p className="text-[12px] text-[#888] leading-relaxed max-w-2xl whitespace-pre-wrap">{task.description || "No documentation registered for this node."}</p>
                            </div>
                            <div className="mb-8 flex flex-col gap-3">
                              <h4 className="text-[9px] text-[#444] uppercase tracking-[0.3em]">Operative Assignment //</h4>
                              <div className="flex items-center gap-4">
                                {task.assignedTo ? (
                                  <>
                                    <UserAvatar photoURL={members.find(m => m.id === task.assignedTo)?.photoURL} name={getMemberName(task.assignedTo)} size="sm" />
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[11px] text-[#ededed] uppercase tracking-widest font-medium">{getMemberName(task.assignedTo)}</span>
                                      <span className="text-[10px] text-[#85C89B] tracking-tighter">{workloadBar}</span>
                                    </div>
                                  </>
                                ) : <span className="text-[10px] text-[#444] italic uppercase">Unassigned Frequency</span>}
                              </div>
                            </div>


                            <div className="mb-8">
                              <h4 className="text-[9px] text-[#444] uppercase tracking-[0.3em] mb-4">Task Notes //</h4>
                              
                              {task.taskNotes && task.taskNotes.length > 0 ? (
                                <div className="space-y-2 mb-4">
                                  {task.taskNotes.slice().sort((a, b) => {
                                    const getT = (t: any) => t?.toMillis ? t.toMillis() : new Date(t).getTime();
                                    return getT(a.createdAt) - getT(b.createdAt);
                                  }).map((note) => (
                                    <div key={note.id} className="flex flex-col gap-1 border-l-2 border-[#1a1a1a] pl-3 py-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-[#666] tabular-nums">{format(typeof (note.createdAt as any).toDate === 'function' ? (note.createdAt as any).toDate() : new Date(note.createdAt as any), "dd MMM HH:mm")}</span>
                                        <span className="text-[9px] text-[#85C89B] uppercase tracking-widest">{getMemberName(note.createdBy)}</span>
                                      </div>
                                      <p className="text-[11px] text-[#aaa] font-mono whitespace-pre-wrap">{note.content}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-[10px] text-[#555] italic mb-4">No operational notes recorded.</p>
                              )}

                              {activeNoteInputId === task.id && (
                                <div className="flex flex-col gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
                                  <textarea
                                    className="w-full bg-[#0A0A0A] border border-[#1a1a1a] rounded p-2 text-[11px] text-[#ededed] font-mono focus:outline-none focus:border-[#333] resize-none"
                                    rows={2}
                                    placeholder="Enter operational note..."
                                    value={noteContent}
                                    onChange={(e) => setNoteContent(e.target.value)}
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      className="px-3 py-1 text-[9px] uppercase tracking-widest text-[#666] hover:text-[#fff] transition-colors"
                                      onClick={() => { setActiveNoteInputId(null); setNoteContent(""); }}
                                    >
                                      [CANCEL]
                                    </button>
                                    <button
                                      className="px-3 py-1 text-[9px] uppercase tracking-widest bg-white/[0.05] hover:bg-white/[0.1] text-white rounded transition-colors"
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
                                              eventType: "DIRECTIVE_TRANSITION",
                                              orgId,
                                              projectId,
                                              actor: { uid: currentUserId, name: actorName },
                                              metadata: { taskTitle: task.title, from: "Note Added", to: "Updated", content: savedContent }
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
                              <span className="text-[10px] text-[#444] tracking-wider uppercase">
                                {task.assignedTo ? `[${activeCount}] tasks assigned to ${getMemberName(task.assignedTo)}` : "[0] OPERATORS TUNED TO THIS NODE"}
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
