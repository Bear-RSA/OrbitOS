import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* tailwind-merge only knows Tailwind's stock scales. Anything custom in
   tailwind.config.ts that shares a prefix with another utility has to be
   registered here, or the merge treats it as a conflict and silently drops
   it — `text-title text-ink` would otherwise resolve to just `text-ink`,
   because both look like colours to it. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "display-sm",
            "title-lg",
            "title",
            "title-sm",
            "lead",
            "body",
            "body-sm",
            "caption",
            "display-lg",
            "body-md",
          ],
        },
      ],
      duration: [{ duration: ["press", "quick", "spring", "settle"] }],
      ease: [{ ease: ["spring", "spring-bounce", "press"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
