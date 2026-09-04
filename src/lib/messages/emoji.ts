/* ------------------------------------------------------------------ */
/*  Emoji                                                              */
/*                                                                     */
/*  A curated set rather than a library. The full Unicode catalogue is */
/*  a megabyte of data and a dependency to keep current, for a feature */
/*  whose whole job is to let somebody say "👍" without leaving the    */
/*  keyboard. Anything not here can still be typed or pasted — a       */
/*  message is plain text and always was.                              */
/*                                                                     */
/*  No images, no sprite sheet, no CDN: these are characters, and the  */
/*  reader's own platform draws them. That is also why they look       */
/*  different on a Mac and on Windows, which is correct — people       */
/*  recognise their own set.                                           */
/* ------------------------------------------------------------------ */

export interface EmojiGroup {
  name: string;
  emoji: string[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: "Smileys",
    emoji: [
      "😀", "😃", "😄", "😁", "😅", "😂", "🙂", "😉", "😊", "😍",
      "😘", "😗", "🙃", "😌", "😔", "😴", "😪", "😮", "😯", "😲",
      "🤔", "🤨", "😐", "😑", "😏", "🙄", "😬", "😳", "😩", "😓",
      "😢", "😭", "😤", "😠", "😡", "🥵", "🥶", "😱", "🤯", "🤗",
      "🤭", "🤫", "😷", "🤒", "🤕", "🥳", "😎", "🤓", "🧐", "🥺",
    ],
  },
  {
    name: "Gestures",
    emoji: [
      "👍", "👎", "👌", "🤌", "✌️", "🤞", "🤝", "👏", "🙌", "🙏",
      "💪", "👊", "✊", "🤙", "👋", "🖖", "☝️", "👆", "👇", "👉",
      "👈", "✍️", "🫡", "🫶", "🤟", "🤘",
    ],
  },
  {
    name: "People",
    emoji: [
      "👤", "👥", "🧑", "👩", "👨", "🧑‍💻", "👩‍💻", "👨‍💻", "🧑‍🎨", "👩‍🎨",
      "👨‍🎨", "🧑‍🏫", "🕵️", "🧑‍🚀", "🦸", "🧠", "👀", "🫀", "🗣️", "👶",
    ],
  },
  {
    name: "Work",
    emoji: [
      "💼", "📁", "📂", "🗂️", "📅", "📆", "🗓️", "📇", "📈", "📉",
      "📊", "📋", "📌", "📎", "🖇️", "📏", "📐", "✂️", "🗃️", "🗄️",
      "📝", "✏️", "🖊️", "🖌️", "📖", "🔍", "🔎", "🔑", "🔒", "🔓",
      "⏰", "⏳", "⌛", "🔔", "📢", "📣", "💡", "🔧", "⚙️", "🧰",
      "💻", "🖥️", "⌨️", "🖱️", "📱", "☎️", "📞", "📧", "📨", "📤",
    ],
  },
  {
    name: "Status",
    emoji: [
      "✅", "☑️", "✔️", "❌", "❎", "⚠️", "🚫", "⛔", "🔴", "🟠",
      "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🚀", "🔥", "⭐", "🌟",
      "✨", "💥", "💯", "❗", "❓", "‼️", "⁉️", "🆗", "🆕", "🔝",
    ],
  },
  {
    name: "Objects",
    emoji: [
      "🎉", "🎊", "🎯", "🏆", "🥇", "🎁", "☕", "🍵", "🍺", "🥂",
      "🍕", "🍔", "🌮", "🍰", "🎂", "🍎", "🌍", "🌱", "🌳", "☀️",
      "🌙", "☁️", "🌧️", "❄️", "🎵", "🎧", "📷", "🎬", "🖼️", "🎨",
    ],
  },
  {
    name: "Hearts",
    emoji: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔",
      "❣️", "💕", "💞", "💗", "💖", "💘", "💝",
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Emoji-only messages                                                */
/* ------------------------------------------------------------------ */

/**
 * How many emoji a message may contain and still be treated as a
 * gesture rather than a sentence.
 *
 * Above this it is a wall of emoji, which reads better at body size —
 * blowing up thirty of them makes a thread unusable.
 */
export const EMOJI_ONLY_MAX = 3;

/**
 * Whitespace, variation selectors, zero-width joiners, skin-tone
 * modifiers and regional indicators — the pieces that combine INTO an
 * emoji without being one on their own.
 */
const COMBINING = /[\s︎️‍\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}]/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;

/** Splits into user-perceived characters, so a flag or 🧑‍💻 counts once. */
function graphemes(text: string): string[] {
  const Segmenter = (
    Intl as unknown as { Segmenter?: typeof Intl.Segmenter }
  ).Segmenter;

  if (Segmenter) {
    return Array.from(new Segmenter("en", { granularity: "grapheme" }).segment(text)).map(
      (s) => s.segment
    );
  }
  /* Code points are wrong for ZWJ sequences — 🧑‍💻 counts as three — but
     this only runs where Intl.Segmenter is missing, and over-counting
     merely means the message renders at normal size. */
  return Array.from(text);
}

/**
 * The number of emoji in a message that is NOTHING BUT emoji, or 0.
 *
 * Drives the enlarged rendering: a lone 👍 is a gesture, and setting it
 * at 13px inside a bubble makes it look like a typo rather than an
 * answer.
 */
export function emojiOnlyCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const parts = graphemes(trimmed).filter((g) => !/^\s+$/.test(g));
  if (parts.length === 0 || parts.length > EMOJI_ONLY_MAX) return 0;

  const allEmoji = parts.every(
    (g) => PICTOGRAPHIC.test(g) || (COMBINING.test(g) && !/[A-Za-z0-9]/.test(g))
  );

  return allEmoji ? parts.length : 0;
}
