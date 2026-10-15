"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMemberSchema, AddMemberInput } from "@/lib/validations/member";
import { createInviteAction } from "@/app/actions/invites";
import { Check, Copy, Link2, Mail, MailCheck, MailWarning, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DIALOG_FOOTER_CLASS, DialogHeading, DialogNotice } from "@/components/ui/dialog-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils/classnames";

interface AddMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  invitedBy: string;
  projectName?: string;
}

export function AddMemberDialog({
  open,
  onOpenChange,
  orgId,
  invitedBy,
  projectName = "OrbitOS",
}: AddMemberDialogProps) {
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AddMemberInput>({
    resolver: zodResolver(addMemberSchema),
  });

  const onSubmit = async (data: AddMemberInput) => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessEmail(null);
    try {
      const result = await createInviteAction({
        orgId,
        email: data.email,
        invitedBy,
        projectName,
      });

      if (result.success && result.inviteLink) {
        setInviteLink(result.inviteLink);

        if (result.emailSent) {
          setSuccessEmail(result.email ?? data.email);
        } else {
          // Invite created, but email failed — show warning, still show the link
          setErrorMsg(result.error ?? "The email didn't send. Copy the link and send it yourself.");
        }
      } else {
        setErrorMsg(result.error ?? "An unexpected error occurred.");
      }

      reset();
    } catch (err) {
      console.error("Failed to create invite:", err);
      setErrorMsg("Something went wrong on our side. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /** Back to an empty form, for inviting the next person. */
  const startOver = () => {
    setInviteLink(null);
    setSuccessEmail(null);
    setErrorMsg(null);
    setCopied(false);
    reset();
  };

  const handleClose = () => {
    startOver();
    onOpenChange(false);
  };

  const emailFailed = !!inviteLink && !successEmail;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]" id="add-member-dialog">
        {inviteLink ? (
          <div>
            <DialogHeading
              icon={emailFailed ? MailWarning : MailCheck}
              tone={emailFailed ? "amber" : "green"}
              title={emailFailed ? "Invite ready, email not sent" : "Invite sent"}
              description={
                emailFailed ? (
                  "The invite exists, but the email didn't go out. Copy the link below and send it yourself."
                ) : (
                  <>
                    We emailed <span className="font-normal text-ink">{successEmail}</span> a link to join.
                    You can also share it yourself.
                  </>
                )
              }
            />

            <div className="space-y-4">
              {emailFailed && errorMsg && <DialogNotice tone="amber">{errorMsg}</DialogNotice>}

              <div className="space-y-2.5">
                <Label htmlFor="invite-link-input" className="block text-[12px] text-ink-dim">
                  Invite link
                </Label>
                <div className="flex items-center gap-2 rounded-xl bg-surface-lowest p-1.5 pl-4 ring-1 ring-inset ring-line/[0.06]">
                  <Link2 className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden />
                  <input
                    id="invite-link-input"
                    value={inviteLink}
                    readOnly
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 truncate bg-transparent font-mono text-[12px] text-ink focus:outline-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={copyLink}
                    id="copy-invite-link"
                    className="h-8 shrink-0 rounded-lg px-3"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-orbit-green" aria-hidden />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="text-[12px] text-ink-dim">The link works for 7 days.</p>
              </div>
            </div>

            <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
              <Button type="button" variant="ghost" onClick={startOver}>
                Invite someone else
              </Button>
              <Button onClick={handleClose} id="close-invite-dialog">
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeading
              icon={UserPlus}
              title="Invite a teammate"
              description="We'll email them a link to join this workspace. You'll get the link too, in case you'd rather send it yourself."
            />

            <div className="space-y-4">
              {/* Full failure: no invite was created. */}
              {errorMsg && <DialogNotice tone="red">{errorMsg}</DialogNotice>}

              <div className="space-y-2.5">
                <Label htmlFor="member-email" className="block text-[12px] text-ink-dim">
                  Email address
                </Label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
                    aria-hidden
                  />
                  <Input
                    id="member-email"
                    type="email"
                    placeholder="name@studio.co.za"
                    autoComplete="off"
                    autoFocus
                    disabled={loading}
                    aria-invalid={errors.email ? true : undefined}
                    className={cn("pl-11", errors.email && "ring-1 ring-orbit-red/40")}
                    {...register("email")}
                  />
                </div>
                {errors.email && <p className="text-[12px] text-orbit-red">{errors.email.message}</p>}
              </div>
            </div>

            <DialogFooter className={cn(DIALOG_FOOTER_CLASS, "gap-2")}>
              <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" isLoading={loading} id="submit-add-member">
                {loading ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
