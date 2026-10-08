/**
 * The studio credit at the foot of every page.
 *
 * Rendered once from the root layout so no page can forget it. Fixed at
 * h-10: the messages screen sizes itself to the viewport minus exactly
 * this, so changing the height means changing it there too.
 */
export function SiteCredit() {
  return (
    <footer className="relative z-10 flex h-10 items-center justify-center">
      <p className="font-mono text-[11px] text-ink-dim">
        Made by{" "}
        <a
          href="https://www.miraistack.co.za/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-muted transition-colors duration-300 hover:text-ink"
        >
          MiraiStack
        </a>
      </p>
    </footer>
  );
}
