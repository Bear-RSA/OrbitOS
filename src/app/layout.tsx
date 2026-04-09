import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";

import { InteractionProvider } from "@/components/ui/interaction-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://orbitos.studio"),
  title: {
    default: "OrbitOS — Studio Operations Dashboard",
    template: "%s | OrbitOS",
  },
  description:
    "OrbitOS gives studio owners the clarity they usually carry in their heads. Know what needs attention, what's at risk, and who's working on what.",
  keywords: ["project management", "studio operations", "agency dashboard", "South Africa"],
  authors: [{ name: "OrbitOS Team" }],
  openGraph: {
    title: "OrbitOS — Studio Operations Dashboard",
    description: "The dashboard small studios need when work starts slipping.",
    url: "https://orbitos.studio",
    siteName: "OrbitOS",
    locale: "en_ZA",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OrbitOS — Studio Operations Dashboard",
    description: "The dashboard small studios need when work starts slipping.",
    creator: "@orbitos",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <InteractionProvider>
          <AuthProvider>{children}</AuthProvider>
        </InteractionProvider>
      </body>
    </html>
  );
}
