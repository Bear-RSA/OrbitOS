"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { onboardingSchema, OnboardingInput } from "@/lib/validations/auth";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { doc, updateDoc, Timestamp, addDoc, collection } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: user?.name ?? "",
    },
  });

  if (loading) return null;

  if (!firebaseUser) {
    router.push("/login");
    return null;
  }

  if (user?.orgId) {
    router.push("/dashboard");
    return null;
  }

  const onSubmit = async (data: OnboardingInput) => {
    setError(null);
    try {
      const uid = firebaseUser.uid;
      const now = Timestamp.now();

      const orgRef = await addDoc(collection(db, "organizations"), {
        name: data.orgName,
        ownerId: uid,
        createdAt: now,
      });
      const orgId = orgRef.id;

      await updateDoc(doc(db, "users", uid), {
        name: data.name,
        orgId,
        role: "owner",
      });

      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Initialization failed. Check network.";
      setError(msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center gap-3 mb-12 justify-center">
          <div className="w-10 h-10 rounded-xl bg-[#111111] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] flex items-center justify-center">
            <span className="text-lg font-bold text-[#ededed]">O</span>
          </div>
          <span className="font-semibold text-[#ededed] text-lg tracking-tight">OrbitOS</span>
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-2xl font-light text-[#ededed] tracking-tight">System configuration</h1>
          <p className="text-[13px] text-[#888888] font-medium mt-2">
            Establish your organizational parameters.
          </p>
        </div>

        <div className="rounded-2xl bg-[#0A0A0A] ring-1 ring-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2.5">
              <Label htmlFor="onboard-name">Operator Designation (Name)</Label>
              <Input
                id="onboard-name"
                placeholder="Your full name"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-xs text-[#E57A7A] mt-1">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="onboard-org">Network Name (Studio / Agency)</Label>
              <Input
                id="onboard-org"
                placeholder="e.g. Mirai Stack"
                {...register("orgName")}
              />
              {errors.orgName && (
                <p className="text-xs text-[#E57A7A] mt-1">{errors.orgName.message}</p>
              )}
            </div>

            {error && (
              <div className="rounded-xl bg-[#1A0A0A] ring-1 ring-[#FF6B6B]/20 px-4 py-3">
                <p className="text-[13px] text-[#E57A7A] font-medium">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={isSubmitting}
              id="onboarding-submit"
            >
              {isSubmitting ? "Configuring..." : "Launch Dashboard"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
