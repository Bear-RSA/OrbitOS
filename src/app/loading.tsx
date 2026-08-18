import { Loader } from "@/components/ui/loader";

/**
 * Route-transition fallback for the whole app.
 *
 * This renders before any client code runs, so it cannot read the theme from
 * the auth profile — it relies on `data-theme` already being on <html>, which
 * `ThemeScript` stamps synchronously in <head>. Everything here is therefore
 * a token, never a literal: a hardcoded dark panel would flash on every
 * navigation for anyone using the light theme.
 */
export default function Loading() {
  return (
    <div className="animate-in fade-in flex min-h-[100dvh] w-full flex-col items-center justify-center gap-6 bg-base duration-1000">
      <Loader />

      <div className="flex flex-col items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-dim">
          System Rendering
        </span>
        <div className="h-px w-24 bg-gradient-to-r from-transparent via-line/[0.14] to-transparent" />
      </div>
    </div>
  );
}
