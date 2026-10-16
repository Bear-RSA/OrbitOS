# OrbitOS handover

What someone needs to run, deploy and fix OrbitOS without Bear in the room.
Written 16 October 2026 against v5.9. No secrets live in this file: it says
where each one comes from, never what it is.

## 1. Accounts

Every service below has a dashboard login. Whoever takes over needs access to
all of them, so fill in the last column and keep it current.

| Service | What it does for OrbitOS | Where the login is kept |
|---|---|---|
| GitHub (`Bear-RSA/OrbitOS`) | Source code | |
| Vercel | Hosting, deploys, the daily cron, production env vars | |
| Firebase (`orbitos-ae41b`) | Sign-in, the Firestore database, push notifications | |
| Cloudinary | Project files, vault files, chat images | |
| Daily | Voice and video calls | |
| Resend | All outgoing email, from `mail.orbit-os.co.za` | |
| Payfast | Billing (self-serve checkout is switched off for now) | |
| GIPHY | GIF and sticker search in messages | |
| Domain registrar and DNS for `orbit-os.co.za` | The site address and email records | |
| Zoho | Inbox mail on `orbit-os.co.za` | |

## 2. Running it locally

1. Install Node 20 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill it in (section 3).
4. Run `npm run dev`, then open `http://localhost:3000`.

Tests run with `npm test`. Lint runs with `npm run lint`.

Do not run `next build` while the dev server is running. The build rewrites
`.next` underneath it and localhost starts returning 500s and 404s. Stop the
dev server first, or check that port 3000 is free.

## 3. Environment variables

The full list with comments is in `.env.example`. Production values live in
Vercel under Project Settings, Environment Variables.

| Variable | Where it comes from | If it is missing |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Always `https://www.orbit-os.co.za` (www, not the bare domain) | Links in emails break |
| `NEXT_PUBLIC_FIREBASE_*` (6 values) | Firebase console, Project settings, Your apps | Nothing loads |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Firebase console, Cloud Messaging, Web Push certificates | Phones do not ring when the app is closed. Everything else works |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase console, Service accounts, Generate new private key | Every server action fails |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary dashboard | Uploads and downloads fail |
| `DAILY_API_KEY`, `CALL_PROVIDER=daily` | Daily dashboard, Developers | Calls fail |
| `RESEND_API_KEY` | Resend dashboard, API keys | No email goes out |
| `RESEND_WEBHOOK_SECRET` | Resend dashboard, Webhooks (shown when the endpoint is added) | Bounces go unrecorded |
| `CRON_SECRET` | Random 32+ characters, set by you | The daily reminder job refuses to run |
| `CALENDAR_FEED_SECRET` | Random 32+ characters, set by you | Calendar feeds and RSVP links fail |
| `PAYFAST_*`, `NEXT_PUBLIC_PAYFAST_*` | Payfast merchant dashboard | Billing fails (only matters once checkout is on) |
| `NEXT_PUBLIC_PAYFAST_ENABLED` | `false` until a gateway is connected | Leave it `false` |
| `BILLING_GUARDRAILS_ENABLED` | Must be `true` for plan limits to apply | Plan limits are not enforced. Hard cost ceilings still apply |
| `GIPHY_API_KEY` | GIPHY developer dashboard | The GIF tab says it is unavailable. Emoji still work |
| `NEXT_PUBLIC_SALES_EMAIL` | Optional | Upgrade requests go to `accounts@miraistack.co.za` |

Generate a random secret with:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Never rotate `CALENDAR_FEED_SECRET` casually. Doing so breaks every calendar
subscription and every RSVP link already sitting in a guest's inbox.

## 4. Deploying

The app deploys itself: every push to `main` builds and goes live on Vercel.

Before pushing:

1. Stop the dev server.
2. Run `npx next build`. Lint errors fail the Vercel build even when the tests
   and `tsc` pass, so this is the check that matters.
3. Run `git push origin main`.
4. Watch the deploy in the Vercel dashboard. If it fails, the log shows the
   first error. Fix it and push again; the previous version stays live until a
   build succeeds.

To roll back, open the Vercel dashboard, pick the last good deployment and
choose Promote to Production.

### Database rules and indexes

These do not deploy with the app. After changing `firestore.rules` or
`firestore.indexes.json`, run:

```
firebase deploy --only firestore:rules,firestore:indexes
```

This needs the Firebase CLI (`npm install -g firebase-tools`) and
`firebase login`. The project is set in `.firebaserc`.

### Scheduled job

`vercel.json` runs `/api/reminders/tasks` every day at 07:00 UTC, which is
09:00 SAST. It emails each assignee the tasks due tomorrow. Vercel sends
`CRON_SECRET` with the request, and the route refuses anything without it.

### Webhooks registered in other dashboards

If the domain ever changes, update these too:

| Service | URL |
|---|---|
| Resend | `https://www.orbit-os.co.za/api/webhooks/resend` |
| Cloudinary | `https://www.orbit-os.co.za/api/webhooks/cloudinary?token=…` (the token is an HMAC of the API secret; the recipe is at the top of that route file) |
| Payfast | Sent with each checkout as `notify_url`, so nothing to register |

## 5. How the code is laid out

| Folder | What lives there |
|---|---|
| `src/app` | Pages. Public site pages (`page.tsx`, `pricing`, `changelog`, `security`) sit next to the app pages (`dashboard`, `projects`, `messages`, `vault`, `tickets`, `teams`) |
| `src/app/actions` | Server actions, one file per area. This is where almost every write happens |
| `src/app/api` | The 18 API routes: webhooks, signed uploads, the calendar feed, the cron job |
| `src/lib` | Business logic, grouped by area (`calls`, `billing`, `vault`, `tickets`, `transcripts`, …). Tests sit next to the code as `*.test.ts` |
| `src/components` | UI components |
| `src/types/subscription.ts` | Every plan, price and limit |
| `firestore.rules` | Who can read and write what in the database |
| `scripts` | One-off maintenance scripts (below) |

### Rules the code follows

Keep to these when changing anything:

- **The caller always comes from the verified session.** A server action never
  trusts a user ID or org ID sent by the browser.
- **Permissions are checked twice**, in `firestore.rules` and again in the
  server action.
- **Anything that costs money has a hard ceiling** (calls, vault storage,
  transcripts, chat images, email, GIF searches). The ceilings live in files
  named `ceiling.ts` and apply on every plan, Custom included. A new paid
  feature needs one too.
- **Limits never take anything away.** They stop a workspace adding more and
  say which limit was hit.
- **Navigation and header buttons are icons only**, with no text labels.

## 6. Maintenance scripts

Both are dry runs unless given `--apply`, and both read `.env.local`.

| Script | What it does |
|---|---|
| `node scripts/backfill-subscriptions.js` | Lists every workspace with its plan and usage. `--apply --tier=<tier>` gives a plan to workspaces that have none |
| `node scripts/backfill-data-integrity.js` | Normalises old records against the current schema |

## 7. Common jobs

| Job | How |
|---|---|
| Move a workspace to a paid plan (while checkout is off) | Set `organizations/{orgId}.subscription` in the Firebase console, then invoice the studio |
| Sell a custom client more than 3 Internal Management seats | In the Firebase console, set `seatOverride` (a number) on `internal_management/{orgId}`. No code change needed |
| See why an email did not arrive | Resend dashboard, Emails. Owners also get a banner on the dashboard when delivery is failing |
| A call will not connect | Check the Daily dashboard for usage and the room, then the Vercel function logs |

## 8. Known loose ends

- Self-serve checkout is off while a payment gateway is chosen.
- `DAILY_DOMAIN` is in `.env.example` but no code reads it.
