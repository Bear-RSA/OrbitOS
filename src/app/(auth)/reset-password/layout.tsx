import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Choose a new password | OrbitOS" },
  description: "Set a new password for your OrbitOS account.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
