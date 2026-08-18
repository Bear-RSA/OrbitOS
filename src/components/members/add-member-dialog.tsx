"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMemberSchema, AddMemberInput } from "@/lib/validations/member";
import { createInviteAction } from "@/app/actions/invites";
import { UserPlus, Copy, Check, CheckCircle2, AlertCircle } from "lucide-react";
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
import { Label } from "@/components/ui/label";

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
          setErrorMsg(result.error ?? "Email dispatch failed. Share the link manually.");
        }
      } else {
        setErrorMsg(result.error ?? "An unexpected error occurred.");
      }

      reset();
    } catch (err) {
      console.error("Failed to create invite:", err);
      setErrorMsg("System error. Please try again.");
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

  const handleClose = () => {
    setInviteLink(null);
    setSuccessEmail(null);
    setErrorMsg(null);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" id="add-member-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 opacity-70" />
            Add Operator
          </DialogTitle>
          <DialogDescription>
            Generate an integration link for a new team member.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 mt-2">
            {/* Success banner */}
            {successEmail && (
              <div className="flex items-start gap-3 rounded-lg bg-orbit-green/10 ring-1 ring-orbit-green/20 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-orbit-green mt-0.5 shrink-0" />
                <p className="text-[12px] font-mono text-orbit-green leading-relaxed">
                  Invite dispatched to <strong>{successEmail}</strong>
                </p>
              </div>
            )}

            {/* Error banner (email failed but invite link still created) */}
            {errorMsg && (
              <div className="flex items-start gap-3 rounded-lg bg-orbit-red/10 ring-1 ring-orbit-red/20 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-orbit-red mt-0.5 shrink-0" />
                <p className="text-[12px] font-mono text-orbit-red leading-relaxed">
                  {errorMsg}
                </p>
              </div>
            )}

            <p className="text-[13px] text-ink-muted font-light text-center">
              Link active. Transmit to operator:
            </p>
            <div className="flex items-center gap-3">
              <Input
                value={inviteLink}
                readOnly
                className="text-[12px] font-mono text-ink"
                id="invite-link-input"
              />
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={copyLink}
                id="copy-invite-link"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-orbit-green" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <DialogFooter className="mt-8 border-t border-line/[0.04] pt-6 sm:justify-center">
              <Button onClick={handleClose} id="close-invite-dialog">Acknowledge</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
            {/* Error banner (full failure — no link created) */}
            {errorMsg && !inviteLink && (
              <div className="flex items-start gap-3 rounded-lg bg-orbit-red/10 ring-1 ring-orbit-red/20 px-4 py-3">
                <AlertCircle className="w-4 h-4 text-orbit-red mt-0.5 shrink-0" />
                <p className="text-[12px] font-mono text-orbit-red leading-relaxed">
                  {errorMsg}
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              <Label htmlFor="member-email" className="text-center block">Network Address (Email)</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="operator@studio.co.za"
                disabled={loading}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[12px] text-orbit-red">{errors.email.message}</p>
              )}
            </div>
            <DialogFooter className="gap-2 mt-8 border-t border-line/[0.04] pt-6 sm:justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} id="submit-add-member">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-line/[0.3] border-t-on-ink rounded-full animate-spin" />
                    Dispatching…
                  </span>
                ) : (
                  "Generate Link"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
