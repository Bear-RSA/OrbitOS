"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * The planet from panel 08 of the brand kit, behind the marketing site and
 * the app.
 *
 * Mounted once in the root layout so it survives client navigation: each
 * route is a stop on the orbit, and moving between pages turns the surface,
 * slides the light along the limb and carries the satellite to that stop.
 * Scroll adds a smaller, eased drift on top and lifts the planet.
 *
 * Only transforms move, and each is set on the element it moves — never
 * through an inherited variable, which would restyle every layer per frame.
 * Masks and gradients are drawn once at a fixed angle; the light "moves"
 * because the element carrying it rotates. Route changes are CSS transitions
 * on transform (they retarget mid-flight if you click again); scroll is a
 * time-based follow written to three layers. Nothing repaints while moving.
 *
 * Two modes. Marketing is the full show and always dark. App is the quiet
 * version for screens people sit in for hours: lower, dimmer, shorter moves,
 * no twinkle. In the light theme the app gets a day palette (globals.css):
 * the same scene drawn as an ink-on-paper star chart. App pages opt in with
 * `bg-ground` instead of `bg-base`, which is transparent while this is mounted.
 */

type Stop = {
  /** Surface longitude: how far the planet has turned under us. */
  lon: number;
  /** Where on the limb the light peaks, degrees from top, clockwise. */
  sun: number;
  /** Satellite position on its ring, degrees from top. Kept 20°+ off
   *  centre so it rests beside the hero copy, never inside it. */
  sat: number;
  /** Where the horizon's apex sits at the top of the page (a CSS length). */
  horizon: string;
  /** Camera roll. */
  roll: number;
};

// Reading pages (changelog, legal) put the horizon just under the title, so
// their long copy sits on the dark planet rather than across the lit limb.
const STOPS: Record<string, Stop> = {
  "/": { lon: 0, sun: 26, sat: 24, horizon: "max(80vh, 730px)", roll: 0 },
  "/methodology": { lon: 48, sun: 12, sat: -22, horizon: "68vh", roll: -2.5 },
  "/pricing": { lon: 96, sun: -6, sat: 26, horizon: "68vh", roll: 2 },
  "/changelog": { lon: 144, sun: -20, sat: -26, horizon: "50vh", roll: -1.5 },
  "/security": { lon: 192, sun: 18, sat: 22, horizon: "49vh", roll: 3 },
  "/privacy": { lon: 224, sun: 10, sat: -20, horizon: "49vh", roll: 1.5 },
  "/terms": { lon: 256, sun: 2, sat: 24, horizon: "49vh", roll: -1 },
  "/contact-sales": { lon: 316, sun: -14, sat: -24, horizon: "76vh", roll: 0 },
};

/* App stops, matched by longest prefix so /projects/abc lands on its own
   stop just past /projects. The call room is deliberately absent: video
   wants a plain black ground. */
const APP_STOPS: [prefix: string, stop: Stop][] = [
  ["/login", { lon: 340, sun: -18, sat: -26, horizon: "78vh", roll: 0 }],
  ["/signup", { lon: 348, sun: -12, sat: 26, horizon: "78vh", roll: 0 }],
  ["/forgot-password", { lon: 332, sun: -22, sat: -24, horizon: "78vh", roll: 0 }],
  ["/reset-password", { lon: 332, sun: -22, sat: 24, horizon: "78vh", roll: 0 }],
  ["/onboarding", { lon: 356, sun: -6, sat: -26, horizon: "80vh", roll: 0 }],
  ["/join", { lon: 356, sun: -6, sat: 26, horizon: "80vh", roll: 0 }],
  ["/rsvp", { lon: 300, sun: 8, sat: -26, horizon: "80vh", roll: 0 }],
  ["/dashboard", { lon: 380, sun: 16, sat: 28, horizon: "84vh", roll: 0 }],
  ["/projects", { lon: 404, sun: 8, sat: -28, horizon: "84vh", roll: 1 }],
  ["/projects/", { lon: 418, sun: 2, sat: -30, horizon: "86vh", roll: 1.5 }],
  ["/messages", { lon: 428, sun: -4, sat: 30, horizon: "86vh", roll: -1 }],
  ["/calendar", { lon: 440, sun: -8, sat: -26, horizon: "84vh", roll: 0 }],
  ["/teams", { lon: 452, sun: -12, sat: -28, horizon: "84vh", roll: -1 }],
  ["/vault", { lon: 476, sun: -20, sat: 28, horizon: "84vh", roll: 1 }],
  ["/profile", { lon: 500, sun: 12, sat: -28, horizon: "84vh", roll: 0 }],
  ["/settings", { lon: 524, sun: 4, sat: 28, horizon: "84vh", roll: 0 }],
];

type Mode = "marketing" | "app";

function resolveStop(pathname: string): { stop: Stop; mode: Mode } | null {
  if (STOPS[pathname]) return { stop: STOPS[pathname], mode: "marketing" };
  let best: [string, Stop] | null = null;
  for (const entry of APP_STOPS) {
    const [prefix] = entry;
    const hit = pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
    if (hit && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best ? { stop: best[1], mode: "app" } : null;
}

/* Star field. Placed in polar coordinates around the planet's centre, in
   the band of sky that can actually be on screen (just above the limb up to
   ~1.5 viewports out), across the arc the orbit sweeps through. Generated on
   the client: ~2,500 box-shadows would add ~100KB to every page's HTML. */
type StarLayer = "dust" | "field" | "bright" | "twinkle";

function buildSky(radius: number, depth: number) {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layer = (count: number, alpha: [number, number], spread: number, glow = false) => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const theta = (rand() - 0.5) * (Math.PI * 0.85); // ±76° either side of top
      // sqrt keeps density even across the band rather than piling at the limb.
      const r = Math.sqrt(radius * radius + rand() * ((radius + depth) ** 2 - radius * radius));
      const x = Math.round(Math.sin(theta) * r);
      const y = Math.round(-Math.cos(theta) * r);
      const a = alpha[0] + rand() * (alpha[1] - alpha[0]);
      // A few cool-white stars so the field isn't one flat grey.
      const tint = rand() > 0.8 ? "214 226 255" : "255 255 255";
      out.push(`${x}px ${y}px 0 ${spread}px rgb(${tint} / ${a.toFixed(2)})`);
      if (glow) out.push(`${x}px ${y}px 7px 1px rgb(${tint} / ${(a * 0.3).toFixed(2)})`);
    }
    return out.join(",");
  };
  return {
    dust: layer(1800, [0.05, 0.2], 0),
    field: layer(620, [0.16, 0.46], 0.3),
    bright: layer(48, [0.55, 0.9], 0.7, true),
    twinkle: layer(40, [0.5, 0.85], 0.6, true),
  } satisfies Record<StarLayer, string>;
}

const NOISE =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='5' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.4 -0.45'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E\")";

/** Planet radius in px, mirroring --orbit-d: max(150vw, 1500px) / 2. */
const planetRadius = () => Math.max(window.innerWidth * 0.75, 750);

export function OrbitBackdrop() {
  const pathname = usePathname();
  const resolved = resolveStop(pathname ?? "");
  const stop = resolved?.stop;
  const mode = resolved?.mode;
  const liftRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const satDriftRef = useRef<HTMLDivElement>(null);
  const [sky, setSky] = useState<Record<StarLayer, string> | null>(null);

  useEffect(() => {
    const radius = planetRadius();
    setSky(buildSky(radius * 0.97, Math.max(window.innerHeight * 1.5, 1300)));
  }, []);

  // Scroll follow. The target is scroll progress; the drawn value chases it
  // with a time constant, so it glides back when navigation resets scroll
  // and runs at the same speed on 60Hz and 120Hz screens. Writes go straight
  // to the three layers that move, as transforms.
  const active = Boolean(stop);
  useEffect(() => {
    if (!active) return;
    const lift = liftRef.current;
    const skyEl = skyRef.current;
    const sat = satDriftRef.current;
    if (!lift || !skyEl || !sat) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    /* Touch screens keep the backdrop still. Following the scroll on a phone
       moved three full-screen layers every frame — and every translucent
       panel above them with it — and `innerHeight` changes as the URL bar
       collapses, so the planet also jumped mid-scroll. The route-to-route
       camera move is CSS and still runs. */
    if (window.matchMedia("(pointer: coarse)").matches) return;

    const liftVh = mode === "app" ? 10 : 24;
    const TAU = 140; // ms
    let current = 0;
    let target = 0;
    let frame = 0;
    let last = 0;

    const paint = (p: number) => {
      lift.style.transform = `translate3d(0, ${(-p * liftVh * window.innerHeight) / 100}px, 0)`;
      skyEl.style.transform = `rotate(${-p * 3}deg)`;
      sat.style.transform = `rotate(${p * 16}deg)`;
    };
    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      current += (target - current) * (1 - Math.exp(-dt / TAU));
      if (Math.abs(target - current) < 0.0004) current = target;
      paint(current);
      if (current === target) {
        frame = 0;
        last = 0;
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    const read = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (!frame) frame = requestAnimationFrame(tick);
    };

    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      cancelAnimationFrame(frame);
    };
  }, [active, mode, pathname]);

  if (!resolved || !stop) return null;

  const { lon, sun, sat, roll, horizon } = stop;
  const rot = (deg: number) => ({ transform: `rotate(${deg}deg)` });

  return (
    <div aria-hidden className="orbit-backdrop" data-mode={mode}>
      {/* Route layer: horizon height and camera roll. Pivot is the planet's
          centre; everything below rotates around it. */}
      <div
        className="orbit-pivot orbit-move"
        style={{
          transform: `translate3d(0, calc(${horizon} + var(--orbit-drop) + var(--orbit-d) / 2), 0) rotate(${roll}deg)`,
        }}
      >
        {/* Scroll layer: written per frame by the effect above. */}
        <div ref={liftRef} className="orbit-lift">
          <div ref={skyRef} className="orbit-sky" data-ready={sky ? "true" : undefined}>
            {(["dust", "field", "bright", "twinkle"] as const).map((layer) => (
              <div
                key={layer}
                className="orbit-stars orbit-move"
                data-layer={layer}
                style={{
                  ...rot(lon * -0.12 * STAR_RATE[layer]),
                  boxShadow: sky?.[layer],
                }}
              />
            ))}
          </div>

          <div className="orbit-ring" />

          <div className="orbit-planet">
            {/* Light rig: drawn with the light at the top, rotated to the sun.
                The surface counter-rotates inside it so terrain turns by
                longitude, not by wherever the light happens to be. */}
            <div className="orbit-lit orbit-move" style={rot(sun)}>
              <div
                className="orbit-surface orbit-move"
                style={{ ...rot(lon - sun), backgroundImage: NOISE }}
              />
            </div>
            <div className="orbit-dayside orbit-move" style={rot(sun)} />
          </div>
          <div className="orbit-limb orbit-move" style={rot(sun)} />
          <div className="orbit-haze orbit-move" style={rot(sun)} />

          <div className="orbit-satellite orbit-move orbit-move-slow" style={rot(sat)}>
            <div ref={satDriftRef} className="orbit-satellite-drift">
              <span />
            </div>
          </div>
        </div>
      </div>
      <div className="orbit-grain" style={{ backgroundImage: GRAIN }} />
    </div>
  );
}

/* Parallax: far dust turns slowest, the bright near stars fastest. */
const STAR_RATE: Record<StarLayer, number> = { dust: 0.55, field: 1, bright: 1.35, twinkle: 1.2 };
