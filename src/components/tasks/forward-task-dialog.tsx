"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Megaphone,
  MessagesSquare,
  Search,
  Send,
  Users,
} from "lucide-react";
import { forwardTaskAction, getOrCreateDmAction } from "@/app/actions/messages";
import {
  subscribeToConversation,
  subscribeToConversations,
} from "@/lib/queries/messages";
import { townHallConversationId } from "@/lib/messages/conversation-id";
import { canPostToConversation } from "@/lib/messages/access";
import { conversationTitle } from "@/lib/messages/summary";
import { MAX_FORWARD_NOTE_LENGTH } from "@/lib/validations/messages";
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
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils/classnames";
import { TOWN_HALL_NAME, type Conversation } from "@/types/message";
import type { Member } from "@/types/member";
import type { Task } from "@/types/task";

/* ------------------------------------------------------------------ */
/*  Forward a task                                                     */
/*                                                                     */
/*  Pick a thread, add a line, send. The directive arrives as a card   */
/*  the conversation can be about, instead of a title pasted into a    */
/*  message and a "which one?" three replies later.                    */
/*                                                                     */
/*  Every member gets this. A directive is workspace-wide already —    */
/*  the checklist shows all of them to everyone, and any member may    */
/*  ring any colleague — so gating the ability to ASK ABOUT one behind */
/*  a role would be a restriction the rest of the product does not     */
/*  make. What stays gated is where it may land, and that is the       */
/*  existing answer rather than a new one: `canPostToConversation`,    */
/*  the same function the composer and the Firestore rule ask, which   */
/*  is why Town Hall only appears here for the owner.                  */
/*                                                                     */
/*  Two targets, one path. An existing thread is forwarded into        */
/*  directly; a colleague you have never written to needs a thread     */
/*  first, so the dm is materialized by the same get-or-create the     */
/*  Messages page uses from People. Nothing here writes a message      */
/*  itself — see the note on `forwardTaskAction` about why the card is */
/*  the server's to mint.                                              */
/* ------------------------------------------------------------------ */

/** What the picker is pointing at. A person has no thread yet. */
type Target =
  | { kind: "conversation"; id: string }
  | { kind: "person"; uid: string };

interface Viewer {
  id: string;
  orgId: string;
  role: string;
}

interface ForwardTaskDialogProps {
  /** The directive being forwarded. null keeps the dialog closed. */
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewer: Viewer;
  /** The org directory, for names, faces, and the People list. */
  members: Member[];
}

export function ForwardTaskDialog({
  task,
  open,
  onOpenChange,
  viewer,
  members,
}: ForwardTaskDialogProps) {
  const router = useRouter();

  const [threads, setThreads] = useState<Conversation[]>([]);
  const [townHall, setTownHall] = useState<Conversation | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /* Where it landed. Holding the id rather than a boolean is what lets
     the confirmation offer to take you there. */
  const [sentTo, setSentTo] = useState<string | null>(null);

  const townHallId = useMemo(
    () => (viewer.orgId ? townHallConversationId(viewer.orgId) : null),
    [viewer.orgId]
  );

  /* Only while the dialog is open. A listener per row of the checklist
     would be one open subscription for every directive on screen. */
  useEffect(() => {
    if (!open || !viewer.id || !viewer.orgId) return;
    return subscribeToConversations(viewer.id, viewer.orgId, setThreads);
  }, [open, viewer.id, viewer.orgId]);

  useEffect(() => {
    if (!open || !townHallId) return;
    return subscribeToConversation(townHallId, setTownHall);
  }, [open, townHallId]);

  const liveNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.id, m.name])),
    [members]
  );

  const directory = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const needle = search.trim().toLowerCase();

  /* Threads first — the ones you already talk in are where a directive
     usually goes. Cleared threads are deliberately still listed: this
     is a send, and forwarding into a chat brings it back to the rail
     anyway, so hiding it here would only make it unfindable. */
  const chats = useMemo(() => {
    const titled = threads.map((conversation) => ({
      conversation,
      title: conversationTitle(conversation, viewer.id, liveNames),
    }));
    if (!needle) return titled;
    return titled.filter(({ title }) => title.toLowerCase().includes(needle));
  }, [threads, viewer.id, liveNames, needle]);

  /* Anyone not already reachable through a dm above, so the same person
     is not offered twice in one list. */
  const people = useMemo(() => {
    const withDm = new Set(
      threads
        .filter((c) => c.type === "dm")
        .flatMap((c) => c.participantIds ?? [])
        .filter((id) => id !== viewer.id)
    );

    return members
      .filter((m) => m.id !== viewer.id && !withDm.has(m.id))
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [members, threads, viewer.id, needle]);

  /* The notice board is offered only to whoever may write on it — the
     same decision the composer makes, asked of the same function, so a
     member is never given a target their send would bounce off. */
  const townHallPostable = Boolean(
    townHall &&
      canPostToConversation({
        type: townHall.type,
        conversationOrgId: townHall.orgId,
        participantIds: townHall.participantIds ?? [],
        viewerUid: viewer.id,
        viewerOrgId: viewer.orgId,
        viewerRole: viewer.role,
      }).allowed &&
      (!needle || TOWN_HALL_NAME.toLowerCase().includes(needle))
  );

  const close = useCallback(() => {
    setTarget(null);
    setNote("");
    setSearch("");
    setErrorMsg(null);
    setSentTo(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const submit = useCallback(async () => {
    if (!task || !target) return;

    setSending(true);
    setErrorMsg(null);
    try {
      /* A colleague you have never written to has no thread yet. Same
         get-or-create the Messages page runs from People, so clicking a
         name twice cannot leave two half-conversations behind. */
      let conversationId: string;
      if (target.kind === "conversation") {
        conversationId = target.id;
      } else {
        const opened = await getOrCreateDmAction({ targetUid: target.uid });
        if (!opened.success) {
          setErrorMsg(opened.error);
          return;
        }
        conversationId = opened.conversationId;
      }

      const result = await forwardTaskAction({
        taskId: task.id,
        conversationId,
        note: note.trim(),
      });

      if (result.success) setSentTo(result.conversationId);
      else setErrorMsg(result.error);
    } catch (err) {
      console.error("[ForwardTask] Could not forward the directive:", err);
      setErrorMsg("System error. Please try again.");
    } finally {
      setSending(false);
    }
  }, [task, target, note]);

  const targetName = useMemo(() => {
    if (!target) return null;
    if (target.kind === "person") return directory.get(target.uid)?.name ?? "that person";
    if (target.id === townHallId) return TOWN_HALL_NAME;

    const found = threads.find((c) => c.id === target.id);
    return found ? conversationTitle(found, viewer.id, liveNames) : "that chat";
  }, [target, directory, threads, townHallId, viewer.id, liveNames]);

  const nothingToPick = chats.length === 0 && people.length === 0 && !townHallPostable;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-md" id="forward-task-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 opacity-70" />
            {sentTo ? "Sent" : "Discuss This Directive"}
          </DialogTitle>
          <DialogDescription>
            {sentTo
              ? `${task?.title ?? "The directive"} is now in ${targetName}.`
              : "Send it to a chat so the conversation can be about it."}
          </DialogDescription>
        </DialogHeader>

        {/* Landed. The chat is a click away rather than a menu away —
            the whole point of forwarding is to go and talk about it. */}
        {sentTo ? (
          <DialogFooter className="mt-8 gap-2 border-t border-line/[0.04] pt-6 sm:justify-center">
            <Button type="button" variant="outline" onClick={close}>
              Stay Here
            </Button>
            <Button
              type="button"
              onClick={() => {
                const id = sentTo;
                close();
                router.push(`/messages?c=${encodeURIComponent(id)}`);
              }}
              id="open-forwarded-chat"
            >
              Open Chat
            </Button>
          </DialogFooter>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="mt-2 space-y-6"
          >
            {errorMsg && (
              <div className="flex items-start gap-3 rounded-lg bg-orbit-red/10 px-4 py-3 ring-1 ring-orbit-red/20">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orbit-red" />
                <p className="font-mono text-[12px] leading-relaxed text-orbit-red">
                  {errorMsg}
                </p>
              </div>
            )}

            {/* What is being sent, named. A picker with no subject on it
                is one mis-click away from forwarding the wrong node. */}
            <div className="rounded-lg border border-line/[0.06] bg-surface-control px-4 py-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-dim">
                Forwarding
              </p>
              <p className="mt-1.5 break-words text-[13px] font-medium tracking-tight text-ink">
                {task?.title ?? "—"}
              </p>
            </div>

            <div className="space-y-2.5">
              <Label className="text-left">Send To</Label>

              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find a chat or a person"
                  disabled={sending}
                  autoComplete="off"
                  aria-label="Find a chat or a person"
                  className="pl-9"
                />
              </div>

              {nothingToPick ? (
                <p className="py-6 text-center font-mono text-[10px] uppercase tracking-[0.15em] text-ink-dim">
                  {needle ? "Nothing matches that" : "Nobody else in the workspace yet"}
                </p>
              ) : (
                <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-line/[0.06] bg-surface-control p-1.5">
                  {townHallPostable && townHall && (
                    <PickerRow
                      picked={target?.kind === "conversation" && target.id === townHall.id}
                      disabled={sending}
                      onPick={() => setTarget({ kind: "conversation", id: townHall.id })}
                      icon={<Megaphone className="h-3.5 w-3.5 text-ink-dim" aria-hidden />}
                      title={TOWN_HALL_NAME}
                      subtitle="Everyone reads this"
                    />
                  )}

                  {chats.map(({ conversation, title }) => {
                    const partnerUid =
                      conversation.type === "dm"
                        ? conversation.participantIds?.find((id) => id !== viewer.id)
                        : undefined;
                    const partner = partnerUid ? directory.get(partnerUid) : undefined;

                    return (
                      <PickerRow
                        key={conversation.id}
                        picked={
                          target?.kind === "conversation" && target.id === conversation.id
                        }
                        disabled={sending}
                        onPick={() =>
                          setTarget({ kind: "conversation", id: conversation.id })
                        }
                        icon={
                          conversation.type === "group" ? (
                            <Users className="h-3.5 w-3.5 text-ink-dim" aria-hidden />
                          ) : (
                            <UserAvatar
                              size="sm"
                              name={title}
                              photoURL={partner?.photoURL}
                            />
                          )
                        }
                        title={title}
                        subtitle={
                          conversation.type === "group"
                            ? `${conversation.participantIds?.length ?? 0} people`
                            : partner?.roleDescriptor ||
                              (partner?.role === "OWNER" ? "Owner" : "Member")
                        }
                      />
                    );
                  })}

                  {people.map((member) => (
                    <PickerRow
                      key={member.id}
                      picked={target?.kind === "person" && target.uid === member.id}
                      disabled={sending}
                      onPick={() => setTarget({ kind: "person", uid: member.id })}
                      icon={
                        <UserAvatar
                          size="sm"
                          name={member.name}
                          photoURL={member.photoURL}
                        />
                      }
                      title={member.name}
                      /* Says what picking this does. A row that silently
                         opens a new chat is a surprise the first time. */
                      subtitle="Starts a new chat"
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-baseline justify-between">
                <Label htmlFor="forward-note" className="text-left">
                  Add a Line
                </Label>
                <span className="font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim">
                  Optional
                </span>
              </div>
              <Textarea
                id="forward-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={MAX_FORWARD_NOTE_LENGTH}
                placeholder="Can you take a look at this?"
                disabled={sending}
                className="min-h-[80px] px-4 py-3 text-[13px]"
              />
            </div>

            <DialogFooter className="mt-8 gap-2 border-t border-line/[0.04] pt-6 sm:justify-center">
              <Button type="button" variant="outline" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={sending || !target || !task}
                id="submit-forward-task"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line/[0.3] border-t-on-ink" />
                    Sending…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <MessagesSquare className="h-3.5 w-3.5" aria-hidden />
                    Send To Chat
                  </span>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */

interface PickerRowProps {
  picked: boolean;
  disabled: boolean;
  onPick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

/** One selectable target. A directive goes to one place at a time. */
function PickerRow({ picked, disabled, onPick, icon, title, subtitle }: PickerRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        aria-pressed={picked}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          picked ? "bg-surface-raised" : "hover:bg-surface-hover",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium tracking-tight text-ink">
            {title}
          </span>
          <span className="block truncate font-mono text-[9px] uppercase tracking-[0.15em] text-ink-dim">
            {subtitle}
          </span>
        </span>
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
            picked ? "border-transparent bg-orbit-green/20" : "border-line/[0.15]"
          )}
        >
          {picked && <Check className="h-3 w-3 text-orbit-green" />}
        </span>
      </button>
    </li>
  );
}
