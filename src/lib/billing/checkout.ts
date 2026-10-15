/* ------------------------------------------------------------------ */
/*  Self-serve checkout switch                                         */
/*                                                                     */
/*  No payment gateway is connected yet. Until one is, paid plans are  */
/*  sold through sales: the billing panel offers "Request upgrade",    */
/*  the request lands in `upgradeRequests/{orgId}` and is emailed to   */
/*  SALES_EMAIL (accounts@miraistack.co.za), and the plan is set with  */
/*  `scripts/backfill-subscriptions.js --apply --tier=<id> --only=<org>`. */
/*                                                                     */
/*  Set NEXT_PUBLIC_PAYFAST_ENABLED=true once the gateway is live to   */
/*  bring the checkout buttons back.                                   */
/* ------------------------------------------------------------------ */

export const SELF_SERVE_CHECKOUT =
  process.env.NEXT_PUBLIC_PAYFAST_ENABLED === "true";

/**
 * Where upgrade requests are sent, and the address shown on the
 * contact-sales page. OrbitOS is a Mirai Stack product, so sales goes to
 * Mirai's accounts inbox; NEXT_PUBLIC_SALES_EMAIL overrides it.
 */
export const SALES_EMAIL =
  (process.env.NEXT_PUBLIC_SALES_EMAIL || "").trim() || "accounts@miraistack.co.za";

export const CHECKOUT_PAUSED_NOTE =
  "We're choosing the best payment gateway for South African studios. Until it's connected, subscriptions go through our sales team: request a plan and we'll move your workspace across.";
