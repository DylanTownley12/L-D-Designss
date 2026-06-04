# L&D Designs — Claude Code Handoff

## What This Is
A solo web design agency automation platform for Dylan Townley. It finds UK barber shops with no website, generates AI preview websites for them, and sends personalised outreach emails automatically.

Repo: dylantownley12/l-d-designss
Branch: claude/fervent-cerf-toUQa

---

## Deployment

- Backend (FastAPI) → Railway → https://l-d-designss-production.up.railway.app
- Frontend (React+Vite) → Vercel → https://l-d-designss.vercel.app
- Database → Supabase (PostgreSQL via PostgREST)

---

## What's Working

- Dashboard fully loads with real stats (794 leads in DB, pipeline chart, notifications)
- Lead Finder agent uses Google Places API (New) Text Search across 80+ UK cities, filters barbers with no real website, deduplicates by name+city, saves to Supabase
- Database client (platform/backend/db/client.py) is a custom httpx PostgREST client. Supabase's official Python library rejects their new sb_secret_... key format so we bypassed it entirely with direct REST calls. Do NOT replace with supabase-py.
- CORS configured on backend to allow *.vercel.app via allow_origin_regex
- Vercel routing: SPA catch-all + API proxy rewrites in platform/frontend/vercel.json
- All agents exist: lead_finder, website_analyzer, preview_generator, outreach_writer, qc_agent, outreach_sender, followup_agent, notification_agent

---

## What's Broken — Leads Page 502

The Leads page in the frontend shows a 502 error.

Root cause: frontend calls /api/leads/ → Vercel rewrites it to Railway → Vercel's proxy times out on the large response (794 leads). Railway logs confirm no /api/leads/ requests ever arrive at Railway — Vercel drops them silently.

Direct browser hit to https://l-d-designss-production.up.railway.app/api/leads/ works fine.

Fix option 1 (quickest): Add VITE_API_URL=https://l-d-designss-production.up.railway.app/api to Vercel environment variables, then redeploy. The frontend will call Railway directly instead of going through Vercel's proxy. CORS already allows *.vercel.app so this is safe.

Fix option 2 (more robust): Add pagination to the leads API endpoint so each response is small enough for Vercel's proxy to handle.

---

## Key Files

platform/backend/main.py — FastAPI app, CORS middleware, routes, APScheduler lifespan
platform/backend/config.py — Settings via pydantic-settings, loads from .env
platform/backend/db/client.py — Custom httpx PostgREST client (NOT supabase-py)
platform/backend/db/migrations.sql — Run once in Supabase SQL Editor to create all tables
platform/backend/agents/lead_finder.py — Google Places API, finds barbers with no website
platform/backend/agents/outreach_writer.py — OpenAI gpt-4o-mini writes emails/SMS copy
platform/backend/agents/outreach_sender.py — Gmail SMTP + Twilio SMS, enforces daily limits
platform/backend/agents/preview_generator.py — Jinja2 renders barber_site.html, saves to static/previews/
platform/backend/tasks/scheduler.py — APScheduler runs agents on schedule automatically
platform/frontend/vercel.json — SPA catch-all + /api/* proxy rewrite to Railway
platform/frontend/src/api/client.js — Axios wrapper, BASE = VITE_API_URL || '/api'
platform/frontend/src/pages/Dashboard.jsx — Main dashboard
platform/frontend/src/pages/Leads.jsx — Leads list (broken due to 502)
platform/frontend/src/pages/Outreach.jsx — Approve/reject outreach queue

---

## Railway Environment Variables (all already set)

SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
OPENAI_API_KEY
GMAIL_ADDRESS
GMAIL_APP_PASSWORD
GOOGLE_PLACES_API_KEY
APP_ENV=production
SECRET_KEY
FOUNDER_EMAIL
PREVIEW_BASE_URL — currently wrong, points to localhost, should be https://l-d-designss-production.up.railway.app/previews

---

## Next Steps in Order

1. Fix Leads page 502 (pick fix option 1 or 2 above)
2. Run Website Analyser agent from dashboard button
3. Run Preview Generator agent from dashboard button
4. Generate outreach emails (outreach_writer agent), approve them in the Outreach page
5. Send first batch via Gmail
6. Fix PREVIEW_BASE_URL in Railway env vars so preview links in emails work

---

## Gotchas

- db/client.py uses httpx directly — do NOT replace with supabase-py, it will break
- Tailwind custom colors (gold, dark-2 etc) cannot be used in @apply inside CSS files — use raw hex values instead (known PostCSS issue)
- Google Places API requires a 2-second delay between paginated requests — already implemented in lead_finder.py
- REQUIRE_APPROVAL=True in config — outreach will not send without manual approval in the UI, this is intentional
- The "Render free tier" waking message in Dashboard.jsx is outdated (backend is on Railway now, not Render) — cosmetic fix when time allows

---

# MONEY MAKING ROADMAP

> Last updated: 2026-06-04. Combines the 14-day plan, CTO review, and Top 25 Bottlenecks report.
> Do not overwrite. Add new entries; update Status fields only.
> Every task is ordered by ROI. Cosmetic work is banned until Tier 1 is complete.

---

## CURRENT PIPELINE STATE

| Metric | Value | Health |
|---|---|---|
| Total leads | 1,091 | ✅ |
| Previews built | 869 | ⚠️ 707 have broken URLs |
| Outreach sent | 68 | ❌ Links were broken — explains 0% reply rate |
| Replies | 0 | ❌ Pipeline is blocked |
| Converted | 0 | ❌ No Stripe, no payment flow |
| Revenue | £0 | ❌ |
| Email channel | Dead | ❌ REQUIRE_APPROVAL=True + enricher has no API key |
| Instagram channel | Dead | ❌ Messages generated but no sender exists |
| WhatsApp | Recovering | ⚠️ Was banned — back to 10/day |

---

## REVENUE TARGETS

| Milestone | What it takes | Realistic timeline |
|---|---|---|
| £75 first deposit | 1 barber pays. Fix previews + Stripe. | Week 1 if pipeline fixed today |
| £1,000/month | ~7 paying clients (£150 build + £15/mo each) | 4-6 weeks post-fix |
| £5,000/month | ~33 recurring clients + new builds | 3-4 months |
| £10,000/month | ~67 recurring + consistent new builds weekly | 6+ months |

---

## OWNERS

- **Dylan** — Founder. Closes deals, replies to warm leads, sets Railway env vars, builds client sites.
- **Friend** — Sales/Outreach. Manual DMs, Instagram, follow-up calls when needed.
- **Claude** — Development. Builds features, fixes bugs, analyzes data, writes optimized copy.
- **OpenClaw** — Automation. Baz handles all inbound WhatsApp, sends 9am batch, follow-up nudges.

---

## DAILY TASKS

These happen every single day without exception.

### Dylan — Daily (30-45 mins total)

| Task | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|
| Read the 8am CEO briefing email | 5 min | High — catch anything broken | You read it and know today's numbers | Not Started |
| Check dashboard for Baz alerts and inbound replies | 5 min | Critical — warm leads go cold in hours | Zero unanswered warm replies at end of day | Not Started |
| Reply personally to every warm/interested lead | 15 min | Highest — human reply closes more than Baz | All threads with a barber reply get a response from Dylan that day | Not Started |
| Send Stripe payment link to any interested lead who hasn't paid | 5 min | Highest — direct revenue | Every "interested" lead has a Stripe link | Not Started |
| Check for any Railway errors or agent failures | 5 min | Medium — catch silent failures | Agent feed shows no red errors | Not Started |

### Friend — Daily (20-30 mins)

| Task | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|
| Send 10 manual Instagram DMs to barbers with no website | 20 min | High — Instagram channel backup while WA is fragile | 10 DMs sent, personalised per barber | Not Started |
| Reply to any barber who responded to your DMs | 10 min | High | Zero unanswered replies | Not Started |

### Claude — Daily (automated at 10am)

| Task | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|
| A/B analysis: which opener variant has the best reply rate | Auto | Medium | Weakest variant killed, replacement written | Automated |
| Surface top 5 leads most likely to convert today | Auto | Medium | Dashboard shows hot leads at the top | Automated |
| Check enricher progress: how many leads have contact info | Auto | High | Count reported in agent logs | Automated |

### OpenClaw — Daily (fully automated)

| Task | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|
| 9am: send 10 WhatsApp messages from the queue, 5-7 min gaps | Auto | High | 10 sends logged, no errors | Automated |
| Auto-reply to every inbound message using AGENTS.md playbook | Auto | Critical | No barber reply goes unanswered > 5 mins | Automated |
| Alert Dylan immediately when any lead says yes, asks about price, or shows interest | Auto | Critical | Dylan gets WhatsApp within 60 seconds of hot signal | Automated |
| Queue follow-up for leads quiet for 48h+ | Auto | Medium | Follow-up sequences running | Automated |

---

## WEEKLY TASKS

### Dylan — Weekly

| Task | Day | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|---|
| Write down real numbers: sends, replies, reply rate %, deposits, revenue | Monday | 15 min | Baseline tracking | Numbers written down, not estimated | Not Started |
| Go through every warm thread — push each one to a yes or no | Monday | 20 min | High | Every thread has a next action | Not Started |
| Review A/B stats panel — which opener is winning? | Tuesday | 10 min | Medium | Decision made on what to cut | Not Started |
| Check if GOOGLE_PLACES_API_KEY is enriching leads — any emails found? | Wednesday | 5 min | High | Count of leads with email > 0 | Not Started |
| Review all sales agent drafts in Outreach page — approve or rewrite | Thursday | 15 min | High | Zero pending drafts | Not Started |
| Personal closing push: message 3 warmest leads with Stripe link | Friday | 15 min | Highest | 3 sent | Not Started |

### Friend — Weekly

| Task | Day | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|---|
| Find 20 new barbers manually (Instagram/Google Maps) not in the system | Monday | 30 min | High | 20 new leads added | Not Started |
| Review your DM reply threads — push warm ones toward payment | Wednesday | 20 min | High | All warm threads actioned | Not Started |
| Report back: what are barbers actually saying? Most common objection? | Friday | 10 min | Medium — shapes the opener | Objection reported to Claude | Not Started |

### Claude — Weekly

| Task | Day | Time | Revenue Impact | Success Metric | Status |
|---|---|---|---|---|---|
| Full stats report: sends/replies/conversion by city, day, variant | Monday | Auto | High | Report in agent logs and emailed | Automated |
| Rewrite weakest A/B variant based on Dylan's objection feedback | Monday | Auto | Medium | New variant live by 9am batch | Automated |
| Audit preview URLs — verify random sample of 20 are loading | Wednesday | Auto | Critical | 0 broken URLs in sample | Not Started |
| Check all cron jobs ran correctly — flag anything that silently failed | Sunday | Auto | Medium | All jobs logged as success | Automated |

---

## BUILD QUEUE

Ordered strictly by revenue impact. Do not reorder for technical interest.
**Rule: nothing below the current tier gets touched until the tier above is complete.**

---

### TIER 1 — Unblock the pipeline (£0 → first money)
Must be done before sending another single message.

| # | Task | Owner | Est. Time | Revenue Impact | Dependency | Success Metric | Status |
|---|---|---|---|---|---|---|---|
| 1 | Fix broken preview URLs — bulk update DB + set PREVIEW_BASE_URL in Railway | Claude + Dylan | 1h | **CRITICAL** — explains 0% reply rate | Dylan sets PREVIEW_BASE_URL=https://l-d-designss-production.up.railway.app in Railway first | All 869 previews return HTTP 200 | Not Started |
| 2 | Set REQUIRE_APPROVAL=false in Railway Variables | Dylan | 2 min | Unlocks email auto-send | None | Email queue starts processing | Not Started |
| 3 | Get GOOGLE_PLACES_API_KEY + add to Railway | Dylan | 15 min | Unlocks enricher → email + Instagram channels | Google Cloud free account | Enricher finds >0 emails on next run | Not Started |
| 4 | Set ANTHROPIC_API_KEY in Railway | Dylan | 2 min | Unlocks agent chat + Claude 10am analysis | None | Agent chat returns a response | Not Started |
| 5 | Set up Stripe account + add STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET to Railway | Dylan | 20 min | Can take payment | None | Checkout URL generated for a test lead | Not Started |
| 6 | Register Stripe webhook URL in Stripe Dashboard | Dylan | 5 min | Payments actually process | Stripe keys set | Webhook test event shows success | Not Started |
| 7 | Build STRIPE_SUCCESS_URL page (book.html on GitHub Pages) | Claude | 1h | Trust after payment | None | Page returns 200 with thank-you message | Not Started |
| 8 | Add "Send Payment Link" button to lead detail on dashboard | Claude | 1.5h | Dylan can send payment link in one click | Stripe keys set | Button appears on lead page, generates valid URL | Not Started |
| 9 | Update Baz AGENTS.md: when barber says yes → auto-send Stripe link | Claude | 30 min | Baz closes sales automatically | Stripe keys set | Baz sends correct link on "yes" signal | Not Started |

---

### TIER 2 — Activate all channels (£first money → £1k/month)

| # | Task | Owner | Est. Time | Revenue Impact | Dependency | Success Metric | Status |
|---|---|---|---|---|---|---|---|
| 10 | Add Gmail reply polling — detect when barbers reply to emails | Claude | 3h | Warm email leads stop going cold | REQUIRE_APPROVAL off, emails sending | Reply detected → lead status → replied | Not Started |
| 11 | Fix follow-up channel: WA-contacted leads get WA follow-ups | Claude | 1h | 68 existing leads get proper follow-up | None | Follow-up sequences use correct channel | Not Started |
| 12 | Surface Instagram DMs on Outreach page with Copy button | Claude | 2h | Manual Instagram channel activated | None | Dylan can copy-paste DMs in <5 seconds | Not Started |
| 13 | Surface sales agent drafts on Outreach page — one-click approve | Claude | 2h | Interested leads get closed | None | Zero approved drafts sitting unsent | Not Started |
| 14 | Add conversation thread to lead detail view | Claude | 3h | Dylan has context before replying | None | Full message history visible on lead page | Not Started |
| 15 | Order WA campaign by quality_score DESC | Claude | 30 min | Higher reply rate from better leads | None | Campaign targets highest-rated barbers first | Not Started |
| 16 | Fix WA campaign limit: generate 10/day not 30 | Claude | 15 min | Queue doesn't accumulate stale messages | None | Queue stays clean | Not Started |
| 17 | Add Stripe webhook idempotency guard | Claude | 30 min | No double-processing of payments | Stripe live | Single update on duplicate webhook | Not Started |

---

### TIER 3 — Scale reliably (£1k/month → £5k/month)

| # | Task | Owner | Est. Time | Revenue Impact | Dependency | Success Metric | Status |
|---|---|---|---|---|---|---|---|
| 18 | Switch outreach_writer from OpenAI to Claude Haiku | Claude | 1h | 50% cost reduction on message generation | None | All messages generated via Anthropic | Not Started |
| 19 | Add Day 30 follow-up step to sequences | Claude | 30 min | Converts slow-burn leads | None | Day 30 messages queuing correctly | Not Started |
| 20 | Add phone deduplication to lead_finder | Claude | 30 min | No double-outreach to same barber | None | Zero duplicate phone numbers in DB | Not Started |
| 21 | Multi-channel dedup: check existing outreach before generating new | Claude | 1h | No barber gets WA + email + Instagram | None | Zero leads with messages in 2+ channels | Not Started |
| 22 | Fix CEO agent in-process retries (use subprocess/background task) | Claude | 2h | Prevents Railway crashes on retry | None | CEO retry never crashes the server | Not Started |
| 23 | Surface Research/CMO insights on dashboard | Claude | 2h | Best cities auto-targeted | None | Top 3 cities shown, lead_finder biased | Not Started |
| 24 | Fix "AGENT UPTIME 15%" — separate scheduled vs crashed agents | Claude | 1h | Dashboard no longer looks broken | None | Scheduled agents show "ON SCHEDULE" | Not Started |
| 25 | Switch email sending to Resend (better deliverability) | Claude | 2h | Emails land in inbox not spam | 50+/day sending volume | Delivery rate >95% | Not Started |

---

### TIER 4 — Infrastructure (£5k/month → £10k/month)

| # | Task | Owner | Est. Time | Revenue Impact | Dependency | Success Metric | Status |
|---|---|---|---|---|---|---|---|
| 26 | Agent feedback loop: reply rate auto-kills losing variants | Claude | 4h | Self-optimising outreach | 50+ replies data | Conversion rate improves week-on-week | Not Started |
| 27 | Live event stream: lead replied → instant sales agent trigger | Claude | 4h | Zero delay on hot leads | None | Hot lead alerted to Dylan in <60s | Not Started |
| 28 | Agent reasoning logs: log *why* not just *what* | Claude | 3h | Platform feels like real AI OS | None | Each decision includes confidence + reason | Not Started |
| 29 | JARVIS OS redesign on all 7 pages | Claude | 8h | Brand/trust | All Tier 1-3 complete | All pages match Dashboard quality | Not Started |
| 30 | Instagram Graph API integration (real DM sending) | Claude | 8h | Full automation of Instagram channel | Facebook Business approval | DMs sent without manual copy-paste | Not Started |

---

## DAILY MONEY SCOREBOARD

Track this every day. Dylan reads it in the 8am briefing email. Update the dashboard to show it live.

| Metric | Today | Yesterday | 7-day avg | All-time |
|---|---|---|---|---|
| Leads found | — | — | — | 1,091 |
| Previews generated | — | — | — | 869 |
| Outreach sent (WA) | — | — | — | 68 |
| Outreach sent (Email) | — | — | — | 0 |
| Outreach sent (Instagram) | — | — | — | 0 |
| Replies received | — | — | — | 0 |
| Interested leads active | — | — | — | 0 |
| Stripe links sent | — | — | — | 0 |
| Deposits collected | — | — | — | 0 |
| Revenue generated (£) | — | — | — | £0 |
| Reply rate (%) | — | — | — | 0% |
| Deposit conversion rate (%) | — | — | — | 0% |

**Targets to hit first money:**
- Reply rate: 3%+ (currently 0% — broken links)
- Deposit conversion: 20%+ of interested leads
- Daily outreach: 10 WA + 10 manual Instagram + email when enricher runs

---

## HONEST ASSESSMENT — CAN WE MAKE MONEY THIS MONTH?

**Yes, but only if Tier 1 is done in the next 48 hours.**

Here is the realistic math:

- Fix preview URLs → reply rate should jump from 0% to 3-5%
- 30 days × 10 WA messages/day = 300 more messages sent
- 300 × 4% reply rate = 12 replies
- 12 replies × 25% conversion (personal closing by Dylan) = 3 deposits
- 3 × £75 = **£225 in deposits this month**
- Plus if email activates (enricher + REQUIRE_APPROVAL=false): double the outreach volume
- Email: 50/day × 30 days × 2% reply = 30 more replies = 7 more deposits = £525

**Realistic best case this month: £400-750 in deposits + £45-90 in first month recurring**

**To hit £1,000 this month** you need either:
1. Above-average reply rate (5%+) AND Dylan personally closing every warm lead, OR
2. Both WA and email channels firing at full volume from day 1

The single thing that decides whether this month is £0 or £500+ is whether the preview URL fix happens today. Every day that passes with broken links is another day of 0% reply rate.

**The pipeline is genuinely impressive. The leads are real. The previews exist. The system works. Three missing env vars and 707 broken URLs are all that stand between you and your first sale.**

