"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Check, Users } from "lucide-react";
import { createGroupAction } from "@/app/actions/messages";
import {
  MAX_GROUP_NAME_LENGTH,
  MAX_GROUP_PARTICIPANTS,
  createGroupSchema,
} from "@/lib/validations/messages";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import type { Member } from "@/types/member";

/* ------------------------------------------------------------------ */
/*  Create group                                                       */
/*                                                                     */
/*  A name and a multi-select over the org directory, the same shape   */
/*  as `members/add-member-dialog`.                                    */
/*                                                                     */
/*  One difference from that dialog: no react-hook-form. The           */
/*  participant picker is not an input element, so the form library    */
/*  has nothing to register and nothing to validate — the payload goes */
/*  through `createGroupSchema` directly instead, which is the exact   */
/*  schema the server action re-runs on the other side.                */
/* ------------------------------------------------------------------ */

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The org directory, already without the creator. */
  people: Member[];
  onCreated: (conversationId: string) => void;
}

export function CreateGroupDialog({
  open,
  onOpenChange,
  people,
  onCreated,
}: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  /* The creator is in the room too, so the picker stops one short of
     the cap rather than at it. */
  const remaining = MAX_GROUP_PARTICIPANTS - 1 - selected.length;

  const toggle = (uid: string) => {
    setErrorMsg(null);
    setSelected((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  const close = () => {
    setName("");
    setSelected([]);
    setErrorMsg(null);
    onOpenChange(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const payload = { name, participantUids: selected };
    const parsed = createGroupSchema.safeParse(payload);
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Check the group details.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const result = await createGroupAction(parsed.data);
      if (result.success) {
        onCreated(result.conversationId);
        close();
      } else {
        setErrorMsg(result.error);
      }
    } catch (err) {
      console.error("Failed to create group:", err);
      setErrorMsg("System error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md" id="create-group-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 opacity-70" />
            New Group
          </DialogTitle>
          <DialogDescription>
            Name the channel and choose who is in it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-2 space-y-6">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-lg bg-orbit-red/10 px-4 py-3 ring-1 ring-orbit-red/20">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orbit-red" />
              <p className="font-mono text-[12px] leading-relaxed text-orbit-red">
                {errorMsg}
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            <Label htmlFor="group-name" className="block text-center">
              Channel Name
            </Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_GROUP_NAME_LENGTH}
              placeholder="Launch crew"
              disabled={loading}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between">
              <Label className="text-left">Participants</Label>
              <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim">
                {selected.length} selected
              </span>
            </div>

            {people.length === 0 ? (
              <p className="py-6 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-ink-dim">
                Nobody else in the workspace yet
              </p>
            ) : (
              <ul className="max-h-56 overflow-y-auto rounded-lg border border-line/[0.06] bg-surface-control p-1.5">
                {people.map((member) => {
                  const picked = selectedSet.has(member.id);
                  /* At the cap, the ones already chosen stay clickable so
                     the only way out is not "start over". */
                  const blocked = !picked && remaining <= 0;

                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => toggle(member.id)}
                        disabled={loading || blocked}
                        aria-pressed={picked}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
                          picked ? "bg-surface-raised" : "hover:bg-surface-hover",
                          blocked && "cursor-not-allowed opacity-30"
                        )}
                      >
                        <UserAvatar
                          size="sm"
                          name={member.name}
                          photoURL={member.photoURL}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium tracking-tight text-ink">
                            {member.name}
                          </span>
                          <span className="block truncate font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim">
                            {member.roleDescriptor ||
                              (member.role === "OWNER" ? "Owner" : "Member")}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            picked
                              ? "border-transparent bg-orbit-green/20"
                              : "border-line/[0.15]"
                          )}
                        >
                          {picked && <Check className="h-3 w-3 text-orbit-green" />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <DialogFooter className="mt-8 gap-2 border-t border-line/[0.04] pt-6 sm:justify-center">
            <Button type="button" variant="outline" onClick={close} disabled={loading}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !name.trim() || selected.length === 0}
              id="submit-create-group"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line/[0.3] border-t-on-ink" />
                  Creating…
                </span>
              ) : (
                "Create Group"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
