/* ------------------------------------------------------------------ */
/*  Shared email shell                                                 */
/*                                                                     */
/*  One layout behind every notification mail, so the reminder, the    */
/*  due-today digest and the end-of-day debrief are recognisably the   */
/*  same product rather than three separately-invented HTML strings.   */
/*                                                                     */
/*  Every rule is an inline `style` attribute. A <style> block is the  */
/*  pleasanter way to write this and the wrong way to ship it: Gmail's */
/*  web client keeps embedded CSS but its clipping strips it on long   */
/*  mail, and Outlook's Word rendering engine drops most of a block    */
/*  while honouring inline declarations. Inline is the only form that  */
/*  survives both, so the tokens below exist to keep the repetition    */
/*  honest rather than to be refactored back into a stylesheet.        */
/*                                                                     */
/*  The palette is lifted from the existing reminder mail so nothing   */
/*  visibly changes for recipients who already get that one.           */
/* ------------------------------------------------------------------ */

const BG = "#050505";
const TEXT = "#ededed";
const MUTED = "#888888";
const DIM = "#6b7280";
const FAINT = "#4b5563";
const LINE = "#1f2937";
const FLAG = "#fbbf24";

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Blocks HTML injection from a title, name or project typed by a person. */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const styles = {
  eyebrow: `margin:0 0 6px;font-size:14px;line-height:20px;color:${MUTED};`,
  heading: `margin:0 0 28px;font-size:20px;line-height:28px;font-weight:600;color:${TEXT};`,
  sectionLabel:
    `margin:32px 0 4px;font-size:11px;line-height:16px;font-weight:700;` +
    `letter-spacing:0.08em;text-transform:uppercase;color:${MUTED};`,
  rowCell: `padding:14px 0;border-bottom:1px solid ${LINE};`,
  title: `font-size:15px;line-height:22px;font-weight:500;color:${TEXT};text-decoration:none;`,
  meta: `margin-top:4px;font-size:12px;line-height:18px;color:${DIM};`,
  flag: `color:${FLAG};font-weight:600;`,
  tail: `padding:14px 0;font-size:13px;line-height:20px;color:${DIM};`,
} as const;

export interface EmailSection {
  /** Uppercase label above the rows. Omitted when there is only one group. */
  label?: string;
  rowsHtml: string;
}

export interface EmailRow {
  title: string;
  /** Deep link. A row without one renders as plain text rather than a dead link. */
  url?: string | null;
  /** Pre-escaped fragments joined with a middot. Build these with `esc`. */
  meta?: string[];
}

/** One task line: linked title above a muted metadata strip. */
export function row({ title, url, meta }: EmailRow): string {
  const metaLine = (meta ?? []).filter(Boolean).join(" &middot; ");
  const label = url
    ? `<a href="${esc(url)}" style="${styles.title}">${esc(title)}</a>`
    : `<span style="${styles.title}">${esc(title)}</span>`;

  return `
      <tr>
        <td style="${styles.rowCell}">
          ${label}
          ${metaLine ? `<div style="${styles.meta}">${metaLine}</div>` : ""}
        </td>
      </tr>`;
}

/** A trimmed list that says nothing about the trim hides work. */
export function tailRow(count: number, noun = "more"): string {
  if (count <= 0) return "";
  return `<tr><td style="${styles.tail}">+ ${count} ${noun} — see the dashboard.</td></tr>`;
}

export interface EmailShellParams {
  /**
   * The grey line clients show beside the subject. Without one they fall
   * back to scraping the first words of the body, which here is the eyebrow.
   */
  preheader: string;
  eyebrow: string;
  /** Already escaped by the caller — headings interpolate names and counts. */
  headingHtml: string;
  sections: EmailSection[];
  ctaLabel: string;
  ctaUrl: string;
  /**
   * Optional callout between the content and the CTA — built with `notice`.
   * Used for the trial prompt on the last free debrief.
   */
  noticeHtml?: string;
  /** Already escaped. The "why am I getting this" line. */
  footerHtml: string;
}

/**
 * A bordered callout. Sits below the content because it is about the mail
 * rather than in it — putting it above would push the thing the reader
 * actually opened the mail for below the fold.
 */
export function notice({
  title,
  bodyHtml,
  linkLabel,
  linkUrl,
}: {
  title: string;
  /** Already escaped. */
  bodyHtml: string;
  linkLabel?: string;
  linkUrl?: string;
}): string {
  const link =
    linkLabel && linkUrl
      ? `<div style="margin-top:10px;"><a href="${esc(linkUrl)}" style="font-size:13px;line-height:20px;font-weight:600;color:${FLAG};text-decoration:none;">${esc(linkLabel)} &rarr;</a></div>`
      : "";

  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:32px;">
        <tr>
          <td style="padding:18px 20px;border:1px solid ${LINE};border-radius:10px;">
            <div style="font-size:13px;line-height:20px;font-weight:600;color:${FLAG};">${esc(title)}</div>
            <div style="margin-top:6px;font-size:13px;line-height:20px;color:${MUTED};">${bodyHtml}</div>
            ${link}
          </td>
        </tr>
      </table>`;
}

export function emailShell(params: EmailShellParams): string {
  const body = params.sections
    .map((section) => {
      const label = section.label
        ? `<div style="${styles.sectionLabel}">${esc(section.label)}</div>`
        : "";
      return `${label}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">${section.rowsHtml}</table>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
</head>
<body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:${FONT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(params.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${BG};border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 24px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;text-align:left;">
          <tr>
            <td>
              <p style="${styles.eyebrow}">${esc(params.eyebrow)}</p>
              <h1 style="${styles.heading}">${params.headingHtml}</h1>
              ${body}
              ${params.noticeHtml ?? ""}
              <div style="margin-top:32px;">
                <a href="${esc(params.ctaUrl)}" style="display:inline-block;background:${TEXT};color:${BG};text-decoration:none;font-size:14px;line-height:20px;font-weight:600;padding:12px 24px;border-radius:8px;">${esc(params.ctaLabel)}</a>
              </div>
              <div style="margin-top:40px;padding-top:20px;border-top:1px solid ${LINE};font-size:12px;line-height:18px;color:${FAINT};">
                ${params.footerHtml}<br>
                OrbitOS by Mirai Stack
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
