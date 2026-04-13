"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Loader } from "@/components/ui/loader";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc } from "firebase/firestore";
import { signOut as firebaseSignOut } from "@/lib/firebase/auth";
import { Member } from "@/types/member";
import { Camera, X, LogOut, Check } from "lucide-react";
import { cn } from "@/lib/utils/classnames";
import { ProfilePictureManager } from "@/components/profile/profile-picture-manager";
import { User } from "@/types/auth";

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: Member;
}

export function ProfileModal({ open, onOpenChange, user }: ProfileModalProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState<string>(user.role);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await firebaseSignOut();
      onOpenChange(false);
      router.push("/login");
    } catch (err) {
      console.error("Sign out failed", err);
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleSave = async () => {
    if ((name === user.name && role === user.role) || !name.trim()) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, "users", user.id), {
        name: name.trim(),
        role: role.trim()
      });
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to update profile", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-[#343536] p-0 border-0 shadow-[0_40px_100px_rgba(0,0,0,0.85)] rounded-[32px] overflow-hidden selection:bg-white/10 selection:text-white ring-1 ring-white/5">
        <div className="flex flex-col h-full max-h-[90vh]">
          
          {/* Architectural Header */}
          <div className="relative h-48 w-full bg-gradient-to-br from-[#1f2021] to-[#0d0e0f] overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(160,120,255,0.05),transparent)] pointer-events-none" />
            <button 
              onClick={() => onOpenChange(false)}
              className="absolute top-8 right-8 w-10 h-10 rounded-full bg-[#343536]/80 backdrop-blur-xl flex items-center justify-center text-[#888888] hover:text-white transition-colors z-20 group"
            >
              <X className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>

            <div className="absolute -bottom-16 left-12 flex items-end gap-8 z-10">
              <ProfilePictureManager user={user as unknown as User} />
              <div className="mb-4">
                <p className="text-[10px] font-mono text-white/20 uppercase tracking-[0.3em] mb-1">Identity Vector</p>
                <h3 className="text-2xl font-light text-white tracking-tight">{name || "Unnamed Node"}</h3>
              </div>
            </div>
          </div>

          {/* Form Layer */}
          <div className="pt-24 px-12 pb-12 overflow-y-auto custom-scrollbar">
            <div className="space-y-10">
              
              {/* Field Matrix */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className="space-y-4">
                  <Label className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#555555] ml-1">Full Legal Name</Label>
                  <div className="relative group">
                    <input 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Node Identifier"
                      className="w-full bg-[#0d0e0f] border-0 rounded-2xl h-14 px-6 text-[15px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:ring-1 focus:ring-[#a078ff]/30 shadow-inner"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <Label className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#555555] ml-1">System Role</Label>
                  <div className="relative group">
                    <input 
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="Access Authority"
                      className="w-full bg-[#0d0e0f] border-0 rounded-2xl h-14 px-6 text-[15px] font-light text-[#ededed] placeholder:text-[#333333] transition-all focus:outline-none focus:ring-1 focus:ring-[#a078ff]/30 shadow-inner"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#555555] ml-1">Authentication Endpoint</Label>
                <div className="w-full bg-[#0d0e0f]/50 border-0 rounded-2xl h-14 px-6 flex items-center text-[14px] font-mono text-[#444444] cursor-not-allowed">
                  {user.email}
                </div>
              </div>

              <div className="space-y-4">
                <Label className="text-[10px] font-mono uppercase tracking-[0.25em] text-[#555555] ml-1">Operational Summary</Label>
                <textarea 
                  placeholder="Describe node responsibilities and bio parameters..."
                  className="w-full bg-[#0d0e0f] border-0 rounded-2xl p-6 text-[15px] font-light text-[#ededed] min-h-[140px] resize-none placeholder:text-[#333333] transition-all focus:outline-none focus:ring-1 focus:ring-[#a078ff]/30 shadow-inner"
                />
              </div>

              {/* Account Configuration */}
              <div className="pt-10 flex flex-col gap-6">
                <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[#444444]">Account Configuration</h4>
                <div className="flex flex-col gap-2">
                  <button onClick={handleSignOut} className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-[#0d0e0f] hover:bg-black transition-colors group">
                    <LogOut className="w-4 h-4 text-[#E57A7A]/40 group-hover:text-[#E57A7A] transition-colors" />
                    <div className="text-left">
                      <p className="text-[13px] font-light text-[#888888] group-hover:text-[#ededed]">Sign Out of Workspace</p>
                      <p className="text-[10px] font-mono text-[#333333] uppercase mt-0.5">End Current Session</p>
                    </div>
                    {isSigningOut && <Loader size={12} stroke={2} className="ml-auto" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Action Footer */}
          <div className="p-8 bg-[#1f2021]/50 flex items-center justify-between">
            <div className="px-6 py-2 bg-[#0d0e0f] rounded-full text-[9px] font-mono uppercase tracking-widest text-[#555555]">
              V2.4.0-Final
            </div>
            <div className="flex items-center gap-6">
              <button 
                onClick={() => onOpenChange(false)}
                className="text-[13px] font-light text-[#666666] hover:text-[#ededed] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSave}
                disabled={isSaving || (name === user.name && role === user.role) || !name.trim()}
                className="gap-2.5 flex items-center justify-center bg-[#ededed] hover:bg-white hover:-translate-y-[2px] disabled:opacity-30 disabled:hover:translate-y-0 text-[#050505] shadow-[0_2px_12px_rgba(255,255,255,0.06)] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-lg px-8 h-11 text-[13px] font-bold tracking-tight focus:outline-none ring-0 overflow-hidden"
              >
                {isSaving ? <Loader size={14} stroke={2} color="#050505" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
}
