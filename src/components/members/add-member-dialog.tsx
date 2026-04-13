"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addMemberSchema, AddMemberInput } from "@/lib/validations/member";
import { createInvite } from "@/lib/queries/members";
import { sendInviteEmail } from "@/lib/email/sendInviteEmail";
import { UserPlus, Copy, Check } from "lucide-react";
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
    try {
      const invite = await createInvite(orgId, data.email, invitedBy);
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
      const currentInviteLink = `${appUrl}/join?token=${invite.token}`;
      setInviteLink(currentInviteLink);

      // Dispatch invitation email without blocking the UI flow
      sendInviteEmail({ 
        email: data.email, 
        inviteLink: currentInviteLink,
        projectName
      }).catch(err => {
        console.error("[Email Failure Notice]:", err);
      });

      reset();
    } catch (err) {
      console.error("Failed to create invite:", err);
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
            <p className="text-[13px] text-[#888888] font-light">
              Link active. Transmit to operator:
            </p>
            <div className="flex items-center gap-3">
              <Input
                value={inviteLink}
                readOnly
                className="text-[12px] font-mono text-[#ededed]"
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
                  <Check className="w-4 h-4 text-[#85C89B]" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
            <DialogFooter className="mt-8 border-t border-white/[0.04] pt-6">
              <Button onClick={handleClose} id="close-invite-dialog">Acknowledge</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
            <div className="space-y-2.5">
              <Label htmlFor="member-email">Network Address (Email)</Label>
              <Input
                id="member-email"
                type="email"
                placeholder="operator@studio.co.za"
                {...register("email")}
              />
              {errors.email && (
                <p className="text-[12px] text-[#E57A7A]">{errors.email.message}</p>
              )}
            </div>
            <DialogFooter className="gap-2 mt-8 border-t border-white/[0.04] pt-6">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading} id="submit-add-member">
                {loading ? "Generating..." : "Generate Link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
