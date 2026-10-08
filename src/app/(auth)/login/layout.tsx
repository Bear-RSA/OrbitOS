import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Sign in | OrbitOS" },
  description: "Sign in to your OrbitOS workspace.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
