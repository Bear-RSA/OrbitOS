import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";

export const metadata: Metadata = {
  title: {
    default: "OrbitOS — Studio Operations Dashboard",
    template: "%s | OrbitOS",
  },
  description:
    "OrbitOS gives studio owners the clarity they usually carry in their heads. Know what needs attention, what's at risk, and who's working on what.",
  keywords: ["project management", "studio operations", "agency dashboard", "South Africa"],
  openGraph: {
    title: "OrbitOS — Studio Operations Dashboard",
    description:
      "The dashboard small studios need when work starts slipping.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
