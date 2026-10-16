"use client";

import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { Network, type LucideProps } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Any Lucide icon, by name                                           */
/*                                                                     */
/*  Departments pick from the whole Lucide set, around 1,500 icons.    */
/*  Importing them all would put every one in the page; this loads     */
/*  each icon on its own the first time it is drawn, and remembers it. */
/*  A name Lucide doesn't have draws the department mark instead.      */
/* ------------------------------------------------------------------ */

export type IconName = keyof typeof dynamicIconImports;

/** Every icon name, kebab-case, in Lucide's order (alphabetical). */
export const ICON_NAMES = Object.keys(dynamicIconImports) as IconName[];

export function isKnownIcon(name: unknown): name is IconName {
  return typeof name === "string" && name in dynamicIconImports;
}

const loaded = new Map<string, LazyExoticComponent<ComponentType<LucideProps>>>();

function load(name: IconName) {
  let icon = loaded.get(name);
  if (!icon) {
    icon = lazy(dynamicIconImports[name] as () => Promise<{ default: ComponentType<LucideProps> }>);
    loaded.set(name, icon);
  }
  return icon;
}

export function LucideIcon({ icon, ...props }: { icon: string | null | undefined } & Omit<LucideProps, "ref">) {
  if (!isKnownIcon(icon)) return <Network {...props} />;
  const Icon = load(icon);
  return (
    <Suspense fallback={<span aria-hidden className={props.className} style={{ display: "inline-block" }} />}>
      <Icon {...props} />
    </Suspense>
  );
}
