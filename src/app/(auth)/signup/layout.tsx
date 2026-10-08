import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Create your workspace | OrbitOS" },
  description: "Create an OrbitOS workspace. Free for teams of three.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
