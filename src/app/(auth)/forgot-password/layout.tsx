import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { absolute: "Reset your password | OrbitOS" },
  description: "Get a link to reset your OrbitOS password.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
