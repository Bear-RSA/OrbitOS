"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { onboardingSchema, OnboardingInput } from "@/lib/validations/auth";
import { useAuth } from "@/contexts/auth-context";
import { db } from "@/lib/firebase/client";
import { doc, setDoc, Timestamp, addDoc, collection } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/brand/logo";
import { friendlyAuthError } from "@/lib/firebase/auth-errors";


export default function OnboardingPage() {
  const router = useRouter();
  const { user, firebaseUser, loading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: user?.name ?? "",
    },
  });

  /* Signup already asked for a name. `defaultValues` is read once, on the
     first render, which lands before the profile loads, so the field used
     to come up empty and ask again. Fill it when the profile arrives and
     only show the field when there is genuinely no name on file. */
  const knownName = user?.name?.trim() ?? "";
  useEffect(() => {
    if (knownName) setValue("name", knownName, { shouldValidate: true });
  }, [knownName, setValue]);

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
        subscription: {
          tier: "exploration",
          status: "active",
          updatedAt: now,
        },
      });
      const orgId = orgRef.id;

      await setDoc(doc(db, "users", uid), {
        name: data.name,
        email: firebaseUser.email,
        orgId,
        role: "OWNER",
        createdAt: now,
      }, { merge: true });

      // Wait for Firestore replication before navigating
      setTimeout(() => {
        window.location.assign("/dashboard");
      }, 500);
    } catch (err: unknown) {
      setError(friendlyAuthError(err, "Couldn't save your details. Check your connection and try again."));
    }
  };

  return (
    <div className="min-h-screen bg-ground flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        <div className="flex flex-col items-center gap-3 mb-12 justify-center">
          <Logo size={40} />
          <span className="font-semibold text-ink text-lg tracking-tight">OrbitOS</span>
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-2xl font-light text-ink tracking-tight">Set up your workspace</h1>
          <p className="text-[13px] text-ink-muted font-medium mt-2">
            {knownName ? "One detail and you're in." : "Two details and you're in."}
          </p>
        </div>

        <div className="rounded-[40px] bg-surface-container/95 border border-outline-variant/10 backdrop-blur-2xl shadow-overlay p-12">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {!knownName && (
            <div className="space-y-2.5">
              <Label htmlFor="onboard-name">Your name</Label>
              <Input
                id="onboard-name"
                autoComplete="name"
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? "onboard-name-error" : undefined}
                placeholder="Your full name"
                {...register("name")}
              />
              {errors.name && (
                <p id="onboard-name-error" role="alert" className="text-[13px] text-orbit-red mt-1">{errors.name.message}</p>
              )}
            </div>
            )}

            <div className="space-y-2.5">
              <Label htmlFor="onboard-org">Studio or agency name</Label>
              <Input
                id="onboard-org"
                autoComplete="organization"
                aria-invalid={errors.orgName ? true : undefined}
                aria-describedby={errors.orgName ? "onboard-org-error" : undefined}
                placeholder="e.g. Mirai Stack"
                {...register("orgName")}
              />
              {errors.orgName && (
                <p id="onboard-org-error" role="alert" className="text-[13px] text-orbit-red mt-1">{errors.orgName.message}</p>
              )}
            </div>

            {error && (
              <div role="alert" className="rounded-xl bg-orbit-red/[0.1] ring-1 ring-orbit-red/20 px-4 py-3">
                <p className="text-[13px] text-orbit-red font-medium">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full mt-2"
              disabled={isSubmitting}
              id="onboarding-submit"
            >
              {isSubmitting ? "Setting up…" : "Open my dashboard"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
