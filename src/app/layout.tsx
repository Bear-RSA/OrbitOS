import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";

import { InteractionProvider } from "@/components/ui/interaction-provider";
import { PreferenceEffects } from "@/components/preference-effects";
import { ThemeScript } from "@/components/theme-script";
import { IncomingCall } from "@/components/calls/incoming-call";
import { MessageNotifier } from "@/components/messages/message-notifier";

// Self-hosted at build time by next/font — no render-blocking @import, no FOUT,
// and a size-adjusted fallback so there is no layout shift while they load.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://www.orbit-os.co.za"),
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
    url: "https://www.orbit-os.co.za",
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
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      // `data-theme` is stamped by ThemeScript before paint and reconciled
      // by PreferenceEffects once the profile loads, so the server-rendered
      // markup deliberately differs from the client's.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        <InteractionProvider>
          <AuthProvider>
            <PreferenceEffects />
            {children}
            {/* A phone that only rings on the page you happen to be
                looking at is not a phone. Mounted once for the whole
                session; renders nothing until somebody calls. */}
            <IncomingCall />
            {/* Renders nothing; chimes when a colleague writes to you.
                Mounted here for the same reason the phone is — a
                notification that only reaches the page you are already
                looking at has not notified anyone. */}
            <MessageNotifier />
          </AuthProvider>
        </InteractionProvider>
      </body>
    </html>
  );
}
