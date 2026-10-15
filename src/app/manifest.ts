import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * What makes OrbitOS installable, and on an iPhone that is more than a
 * nicety: iOS only grants push to a site added to the Home Screen, and
 * only treats it as an app when this file says `display: standalone`.
 * Without it, an iPhone can never be rung while OrbitOS is closed.
 *
 * Opens on the dashboard, which bounces a signed-out visitor to /login
 * like any other app route.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "OrbitOS",
    short_name: "OrbitOS",
    description: "Studio operations: projects, people, calls and messages in one place.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050505",
    theme_color: "#050505",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
