import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth-context";

import { InteractionProvider } from "@/components/ui/interaction-provider";
import { PreferenceEffects } from "@/components/preference-effects";
import { ThemeScript } from "@/components/theme-script";
import { CallProvider } from "@/contexts/call-context";
import { CallHost } from "@/components/calls/call-host";
import { MessageNotifier } from "@/components/messages/message-notifier";
import { PresenceHeartbeat } from "@/components/presence-heartbeat";
import { OrbitBackdrop } from "@/components/marketing/orbit-backdrop";
import { SiteCredit } from "@/components/site-credit";

// Self-hosted at build time by next/font — no render-blocking @import, no FOUT,
// and a size-adjusted fallback so there is no layout shift while they load.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  // Inter's optical-size axis: the browser picks a cut for the size, so
  // display text gets tighter, finer letterforms than 14px body copy.
  axes: ["opsz"],
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
  /* Installed to an iPhone's Home Screen, OrbitOS opens as its own app
     rather than a Safari tab — the condition iOS sets for push. */
  appleWebApp: {
    capable: true,
    title: "OrbitOS",
    /* A solid bar, not "black-translucent": nothing in the layout pads
       for the notch, so a see-through bar would sit on the header. */
    statusBarStyle: "black",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  /* Paint edge to edge, under the home indicator, and pad content back out
     with env(safe-area-inset-*). Without this every inset reads as 0px. */
  viewportFit: "cover",
  /* Android: the keyboard shrinks the layout, as it does on iOS, so the
     messages composer rides up with it instead of hiding behind it. */
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#050505" },
    { media: "(prefers-color-scheme: light)", color: "#FAF9F7" },
  ],
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
        {/* Above the router so the planet persists between marketing pages
            and navigation can move along the orbit. Renders nothing on any
            other route. */}
        <OrbitBackdrop />
        <InteractionProvider>
          <AuthProvider>
            <PreferenceEffects />
            {/* Calls live above the router. A room mounted inside a page
                is a room that ends when somebody clicks Projects, which
                is not what leaving a call is supposed to mean — so the
                session is held here and the host renders it, and every
                screen underneath can come and go around a live call. */}
            <CallProvider>
              {children}
              <SiteCredit />
              <CallHost />
            </CallProvider>
            {/* Renders nothing; chimes when a colleague writes to you.
                Mounted here for the same reason the phone is — a
                notification that only reaches the page you are already
                looking at has not notified anyone. */}
            <MessageNotifier />
            {/* Renders nothing; tells teammates you are here, on every page. */}
            <PresenceHeartbeat />
          </AuthProvider>
        </InteractionProvider>
      </body>
    </html>
  );
}
