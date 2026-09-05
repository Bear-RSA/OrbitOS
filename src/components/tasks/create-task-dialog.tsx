"use client";

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema, CreateTaskInput } from "@/lib/validations/task";
import { createTaskAction } from "@/app/actions/tasks";
import { recordTelemetryAction } from "@/app/actions/telemetry";
import { Member } from "@/types/member";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SuccessModal } from "@/components/ui/success-modal";
import { Label } from "@/components/ui/label";
import { X, ChevronDown } from "lucide-react";

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  /** Fixed destination. Omit when `projects` is supplied and the user picks. */
  projectId?: string;
  /**
   * Offering a choice turns this into quick capture: the dashboard has no
   * project in scope, so without a picker a task could only be created by
   * navigating into a project first.
   */
  projects?: { id: string; name: string }[];
  members: Member[];
  currentUserId: string;
  onCreated: () => void;
}

export function CreateTaskDialog({
  open,
  onOpenChange,
  orgId,
  projectId,
  projects,
  members,
  currentUserId,
  onCreated,
}: CreateTaskDialogProps) {
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosenProjectId, setChosenProjectId] = useState(projectId ?? "");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const showProjectPicker = !projectId && Boolean(projects?.length);
  const targetProjectId = projectId ?? chosenProjectId;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: { assignedTo: [], dueDate: null, milestone: null },
  });

  const selectedAssignees = watch("assignedTo") || [];

  useEffect(() => {
    if (open) {
      setValue("milestone", null);
      setError(null);
      // Default to the first project so the common case is one click.
      setChosenProjectId(projectId ?? projects?.[0]?.id ?? "");
    }
  }, [open, setValue, projectId, projects]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleAssignee = (memberId: string) => {
    const current = selectedAssignees;
    if (current.includes(memberId)) {
      setValue("assignedTo", current.filter(id => id !== memberId));
    } else if (current.length < 2) {
      setValue("assignedTo", [...current, memberId]);
    }
  };

  const removeAssignee = (memberId: string) => {
    setValue("assignedTo", selectedAssignees.filter(id => id !== memberId));
  };

  const onSubmit = async (data: CreateTaskInput) => {
    if (!targetProjectId) {
      setError("Select a project for this directive.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await createTaskAction({
        orgId,
        projectId: targetProjectId,
        title: data.title,
        description: data.description ?? "",
        assignedTo: data.assignedTo,
        milestone: data.milestone || "Unassigned",
        createdBy: currentUserId,
        dueDate: data.dueDate || null,
      });
      if (!result.success) throw new Error(result.error);

      // Fire background sync and telemetry.
      // DIRECTIVE_CREATED and DIRECTIVE_ASSIGNED are logged by
      // createTaskAction itself — see the note atop actions/tasks.ts.
      const actorName = members.find((m) => m.id === currentUserId)?.name || "System";

      // Emit WORKLOAD_SHIFT for each assigned operative
      if (data.assignedTo.length > 0) {
        recordTelemetryAction({
          eventType: "WORKLOAD_SHIFT",
          orgId,
          projectId: targetProjectId,
          actor: { uid: currentUserId, name: actorName },
          metadata: { taskTitle: data.title, assignedTo: data.assignedTo },
        }).catch(err => console.error("[Telemetry Error]:", err));

        import("@/app/actions/personnel").then(({ syncOperationalStatusAction }) => {
          data.assignedTo.forEach(uid => {
            syncOperationalStatusAction(uid, orgId).catch(err => console.error("[Sync Error]:", err));
          });
        });
      }

      reset();
      onOpenChange(false);
      onCreated();
      setShowSuccess(true);
    } catch (err) {
      // Previously swallowed into the console, so a server-side rejection
      // (org mismatch, missing project, the two-operative cap) closed
      // nothing and explained nothing.
      console.error("Failed to create task:", err);
      setError(err instanceof Error ? err.message : "Failed to insert directive.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px] p-10 bg-surface-sunken/95 border-line/[0.04]">
        <DialogHeader className="text-left sm:text-left space-y-4">
          <DialogTitle className="text-xl font-medium tracking-tight text-ink">
            Insert Directive
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-ink-dim font-light max-w-[360px]">
            Inject a new task vector. Assign up to two operators and set completion horizon.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
          {showProjectPicker && (
            <div className="space-y-2.5">
              <Label htmlFor="task-project">Target Project</Label>
              {/* A native select rather than the Radix one: this form's other
                  fields use the ink/line token family, and the Radix trigger
                  is built on a different palette. */}
              <select
                id="task-project"
                value={chosenProjectId}
                onChange={(e) => setChosenProjectId(e.target.value)}
                disabled={loading}
                className="w-full h-9 bg-surface-sunken border border-line/[0.1] rounded-md px-3 text-[13px] text-ink transition-colors focus:outline-none focus:border-line/[0.2] disabled:opacity-50"
              >
                {projects!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2.5">
            <Label htmlFor="task-title">Directive Title</Label>
            <Input
              id="task-title"
              placeholder="What needs to be done?"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-[12px] text-orbit-red">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2.5">
            <Label htmlFor="task-description">Additional Context</Label>
            <Textarea
              id="task-description"
              placeholder="Provide execution details..."
              rows={3}
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2.5">
              <Label>Operators <span className="text-[9px] text-ink-dim ml-1 font-mono">(MAX 2)</span></Label>
              <div ref={dropdownRef} className="relative">
                {/* Selected chips + trigger */}
                <button
                  type="button"
                  id="task-assignee"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="w-full min-h-[36px] flex items-center gap-1.5 flex-wrap bg-surface-sunken border border-line/[0.1] rounded-md px-3 py-1.5 text-left focus:outline-none focus:border-line/[0.2] transition-colors"
                >
                  {selectedAssignees.length === 0 ? (
                    <span className="text-[13px] text-ink-dim">Unassigned</span>
                  ) : (
                    selectedAssignees.map(uid => {
                      const member = members.find(m => m.id === uid);
                      return (
                        <span
                          key={uid}
                          className="inline-flex items-center gap-1 bg-surface-control border border-line/[0.08] rounded px-2 py-0.5 text-[11px] text-ink font-mono uppercase tracking-wider"
                        >
                          {member?.name?.split(" ")[0] || "?"}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); removeAssignee(uid); }}
                            className="hover:text-orbit-red transition-colors ml-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-ink-dim ml-auto shrink-0" />
                </button>

                {/* Dropdown */}
                {dropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-surface-sunken border border-line/[0.1] rounded-md shadow-raised overflow-hidden">
                    {members.map(member => {
                      const isSelected = selectedAssignees.includes(member.id);
                      const isDisabled = !isSelected && selectedAssignees.length >= 2;
                      return (
                        <button
                          key={member.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => toggleAssignee(member.id)}
                          className={`w-full text-left px-3 py-2 text-[12px] font-mono transition-colors ${
                            isSelected
                              ? "bg-surface-control text-ink"
                              : isDisabled
                                ? "text-ink-faint cursor-not-allowed"
                                : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {isSelected && <span className="text-orbit-green text-[10px]">●</span>}
                            {member.name}
                            {isDisabled && <span className="text-[9px] text-ink-faint ml-auto uppercase tracking-widest">[MAX]</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {errors.assignedTo && (
                <p className="text-[12px] text-orbit-red">{errors.assignedTo.message}</p>
              )}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="task-due-date">Completion Horizon</Label>
              <Input
                id="task-due-date"
                type="date"
                {...register("dueDate")}
                /* `color-scheme: dark` on <html> already renders the picker glyph
                   light — inverting it here would flip it back to black. */
                className="[&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50 [&::-webkit-calendar-picker-indicator]:transition-opacity hover:[&::-webkit-calendar-picker-indicator]:opacity-100"
              />
            </div>
          </div>


          {error && <p role="alert" className="text-[12px] text-orbit-red">{error}</p>}

          <DialogFooter className="flex-row justify-start sm:justify-start gap-4 mt-10">
            <Button
              type="submit"
              disabled={loading}
              id="submit-create-task"
              className="h-9 px-5 rounded-lg text-[12px] min-w-[120px]"
            >
              {loading ? "Inserting..." : "Insert Directive"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 px-5 rounded-lg text-[12px] text-ink-faint hover:text-ink-muted hover:bg-transparent"
            >
              Cancel
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>
      <SuccessModal
        open={showSuccess}
        onOpenChange={setShowSuccess}
        title="Directive Inserted"
        description="The task vector has been successfully registered."
      />
    </>
  );
}
