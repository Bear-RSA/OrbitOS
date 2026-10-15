<!-- /founder:pricing-strategy · 2026-10-15 · input: the whole project. Free tier, Standard tier, Pro tier, then a Custom tier that says contact sales. Break down the tiers and pricing in ZAR. -->

# OrbitOS pricing strategy

Assumption: rand conversions use R17 per USD. Mid-market was R16.43 to R16.83 in late July 2026 ([Key Currency](https://keycurrency.co.uk/convert-usd-to-zar/), [CurrencyConvert](https://currencyconvert.online/usd/zar)). No October 2026 rate was found, so R17 adds a small buffer.
Assumption: prices exclude VAT. If OrbitOS is VAT-registered, 15% comes out of the margins below.
Assumption: tiers map onto the code in `src/types/subscription.ts`: Free = `exploration`, Standard = `foundational`, Pro = `studio_core`, Custom = `total_visibility`.

The four-tier idea is right. Moving the top tier to "Contact sales" also fixes a real problem: the R1,499 "Total Visibility" tier promises "No limits", but the hard ceilings in `lib/*/ceiling` cap it anyway (12 call participants, 20 GB vault, 500 transcripts a month). An "unlimited" self-serve tier on Firebase Blaze is a bill you cannot predict. Custom deals let you price the heavy users one by one.

## 1. Pricing model analysis

| Model | Fit | Pros | Cons |
|---|---|---|---|
| Flat subscription | 4 | One number, easy for small SA studios to approve | Heavy users cost more than light ones at the same price |
| Usage-based | 2 | Matches the Daily and Firestore bills | Studios can't budget for it, and it punishes using calls |
| Per-seat | 3 | Grows with the team | Owners hold back invites, so fewer people use the product |
| Freemium | 4 | Already built (`exploration`), so solo operators can try it free | Free workspaces cost money on Blaze |
| Credits | 1 | Fits AI features | OrbitOS sells no AI or credit-type features |
| One-time purchase | 1 | None that matter | Running costs keep going every month |

**Recommendation: a flat price per workspace, a free tier, and a member cap on each tier.** Basecamp charges this way ([pricing](https://basecamp.com/pricing)). A flat price undercuts per-seat tools by a wide margin. The member cap makes team growth the reason to upgrade, and the existing `TierLimits` keep the cost-bearing features in check.

## 2. Tier design

| | Free | Standard | Pro | Custom |
|---|---|---|---|---|
| Monthly | R0 | **R399** | **R999** | Contact sales (internal floor R2,499) |
| Annual | R0 | R3,990 (R333/mo) | R9,990 (R833/mo) | Quoted, annual only |
| Annual discount | n/a | 17% (2 months free) | 17% | n/a |

### Free (`exploration`)
- 1 owner, 2 members, 3 projects
- Calls with up to 2 people, no outside guests
- 1 live telemetry stream
- Vault: 100 MB, 25 documents
- 100 chat images a month, 10 task reminders a day
- No transcripts and no client guests on engagements

**Hook:** one operator runs real projects and calls a colleague for free.
**Upgrade trigger:** they add a third person, start a fourth project, or need to invite a client.

### Standard (`foundational`)
- 1 owner, 5 members, 5 projects
- Calls with up to 4 people
- 3 client guests per engagement
- 20 transcripts a month
- Vault: 1 GB, 200 documents
- 1,000 chat images a month, 30 reminders a day, 2 live streams

**Upgrade trigger:** a sixth member, or a client who needs to join a call. Standard allows 0 call guests.

### Pro (`studio_core`), the target tier
- 3 owners, **15 members** (code has 10, raise it), **25 projects** (code has 10)
- Calls with up to 10 people, **5 outside guests per call**
- 10 client guests per engagement
- 100 transcripts a month
- Vault: 5 GB, 1,000 documents
- 3,000 chat images a month (the hard ceiling), 75 reminders a day, 4 live streams

Why 15 members: at 10 members, an 11-person studio has to book a sales call with you, and you are the whole sales team. At 15, Custom only gets teams big enough to be worth the call.
**Upgrade trigger:** a 16th member, more than 10 people on a call, or more than 5 GB in the vault.

### Custom (`total_visibility`), sales-led
- 16+ members, 5+ owners
- Limits raised up to the hard ceilings and written into the quote. Never "unlimited".
- Annual invoice paid by EFT, which avoids the Payfast fee
- [Only list what you will actually deliver: onboarding session, support response time, POPIA data processing agreement]

**Floor of R2,499 a month** because 16 to 25 members on Pro-level usage costs about 2.5x a Pro workspace to run (estimate, see section 4).

## 3. Competitive pricing context

All checked 2026-10-15, converted at R17/USD.

| Competitor | Price | Included | OrbitOS position |
|---|---|---|---|
| [monday.com](https://monday.com/pricing) | Standard $12, Pro $19 per seat a month, annual, minimum 3 seats | Boards and automations, no video calls | **Far below.** 15 seats on monday Pro cost R4,845 a month, and OrbitOS Pro is R999. Lead with this comparison |
| [ClickUp](https://clickup.com/pricing) | Core $9, Business $17 per user a month, annual | Tasks, docs, AI add-ons | **Below.** 10 users on Business cost R2,890 a month |
| [Basecamp](https://basecamp.com/pricing) | Freelancer $25, Studio $59, Pro $99 flat a month | Flat price, unlimited users on Studio and up | **Between.** Standard (R399) is below Freelancer (R425). Pro (R999) is level with Studio (R1,003), and OrbitOS adds calls, transcripts and a vault |

Not found: a South African competitor with ZAR pricing for studio operations software.

## 4. Unit economics check

Variable cost per workspace per month. **All estimates** except where linked.

| Cost | Free | Standard | Pro |
|---|---|---|---|
| Calls ([Daily](https://www.daily.co/pricing/video-sdk/): $0.004 per participant-minute) | 2 h × 2 people = 240 min = R16 | 4 h × 3 = 720 min = R49 | 8 h × 4 = 1,920 min = R131 |
| Firestore reads and writes (estimate) | R10 | R25 | R60 |
| Cloudinary, Resend, storage (estimate) | R5 | R15 | R40 |
| Payfast: 3.2% + R2, plus VAT on the fee ([fees](https://payfast.io/fees/)) | R0 | R17 | R39 |
| **Total** | **R31** | **R106** | **R270** |
| **Gross margin** | n/a | **73%** | **73%** |

Daily includes 10,000 free participant-minutes a month across the whole account, so early real costs sit below these numbers.

**Fixed costs (estimate):** Vercel Pro $20 + Resend Pro $20 ([pricing](https://resend.com/pricing)) + other subscriptions ≈ R1,000 a month. Add 100 free workspaces at R31 each = R3,100. **Total: about R4,100 a month.**

**Break-even, using contribution per workspace (Standard R293, Pro R729):**
- 14 Standard workspaces alone, or
- 6 Pro workspaces alone, or
- 8 Standard + 3 Pro (R4,531)

**Target blended ARPU across paid workspaces: R750.** Calculation: 60% Standard × R399 + 35% Pro × R999 + 5% Custom × R3,500 = R764.

## 5. Pricing psychology

1. **Anchoring:** put "Custom: Contact sales" in the right-hand column and add one line under Pro: "15 people on monday.com Pro: R4,845/mo." Because the visitor sees a bigger number first, R999 reads as the sensible choice.
2. **Decoy:** Standard is the decoy. It is R600 cheaper than Pro but blocks outside guests on calls, which is the thing a client-facing studio needs. Because the gap is one feature they will hit in week one, most studios that compare the two pick Pro. Keep the "Recommended" badge on Pro.
3. **Annual framing:** show "R833/mo, billed yearly. 2 months free" rather than "R9,990/yr" or "17% off". Because a monthly figure compares directly with the R999 price, the saving is easy to see. The FAQ currently says month-to-month only: update it, and check that Payfast subscriptions support an annual frequency.

## 6. Launch pricing vs. scale pricing

**Launch price (first 90 days): Standard R299, Pro R699.** These are the prices already in the code. Because there are no testimonials or logos yet, a lower price makes up for the trust gap. It also brings in the first 10 to 20 paying studios faster, and you need them for case studies.

**Grandfathering:** launch customers keep R299 or R699 for **12 months** after the scale price goes live, as long as they stay subscribed. Give 60 days' email notice before moving them up. Because this is a fixed date and not "forever", you avoid carrying under-priced accounts for years, and early customers still get a real reward.

**Price increase triggers.** Move to R399 and R999 when **any one** of these happens:
- 20 paying workspaces
- Free-to-paid conversion above 4% for 2 months in a row
- Monthly paid churn below 3% for 2 months in a row
- 90 days have passed since launch

After that, review prices every 12 months. Raise them by 10 to 15% if Pro takes more than 40% of new paid signups, because that shows the price is below what studios will pay.

Code changes this needs (not made yet): Pro `maxMembers` 10 → 15, `maxProjects` 10 → 25, `total_visibility` shown as "Contact sales", and the pricing page and FAQ copy.
