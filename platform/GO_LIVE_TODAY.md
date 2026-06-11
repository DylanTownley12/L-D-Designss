# GO LIVE TODAY — Tradesman Website Revenue OS

The founder cockpit is **`https://l-d-designss.vercel.app/mission-control`** (everything —
`/`, `/jarvis`, `/command`, `/ops` — redirects there). One brain, one agent set, two doors
(web console + the same brain over chat). We sell tradespeople a **website build + lead
capture** (one-off build fee + recurring). Below: the exact order tonight, then before calls.

---

## TONIGHT — in this order (~10 minutes)

### 1. Create the database tables  ← the only hard blocker (Railway has no DATABASE_URL, so this can't be automated)
- Supabase → **SQL Editor** → **New query**
- Paste the whole of **`platform/backend/db/PASTE_INTO_SUPABASE.sql`** → **Run**
- It's idempotent and only adds trades tables/columns — it does NOT touch barber data.
- The verification SELECTs at the bottom should list **8 tables**: `prospects, captured_leads,
  next_actions, tasks, jarvis_log, agent_events, decisions, activity_logs`.

### 2. Confirm Railway env vars  (Settings → Variables)
| Var | State | Action |
|---|---|---|
| `OPS_KEY` | ✅ set | this is what you type into the /mission-control gate |
| `ANTHROPIC_API_KEY` | ✅ set | powers JARVIS + AI lead summaries |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | ✅ set | DB + photo storage |
| `OPENCLAW_WEBHOOK_URL` | ❌ **not set** | **PRIMARY** notify channel — point at the OpenClaw inbound webhook so the daily CEO briefing + live lead alerts hit your WhatsApp via Baz. Optional (web cockpit works without it). |
| `TELEGRAM_BOT_TOKEN` | ❌ not set | fallback only, used if OpenClaw URL is blank |
| `FOUNDER_CHAT_IDS` | ❌ not set | comma-separated chat IDs for D and L (only needed for the Telegram fallback) |
| `CLAUDE_MODEL` | optional | defaults to `claude-opus-4-8`; set to swap models |
| `FRONTEND_BASE_URL` | optional | defaults to the Vercel URL (correct) |

**Vercel needs nothing** — `client.js` already points at the Railway backend. (If you ever
set `VITE_API_URL`, you must redeploy Vercel for it to take effect.)

### 3. Open the cockpit + seed
- Go to **`/mission-control`**, type your `OPS_KEY` (remembered after the first time).
- Hit **Seed demo** → 30 NW-England prospects (split D/L, with notes + overdue follow-ups),
  10 tasks, "Demo Plumbing Co" with a live capture link, and 3 sample leads (one with a photo).
- Every panel should now be populated.

### 4. Test the capture flow on your phone
- In the console type `status` — it tells you the demo capture link, or grab it from the Seed toast.
- Open that `/capture/<token>` link **on your phone**, fill it in, **add a photo**, submit.
- Check: the lead appears in the **Captured leads** panel (with 📷), founders get a Telegram alert
  (if step 2 done), and it shows on the client dashboard at `/d/<token>`.

### 5. Drive it once from the console
- `what should D do now?` · `who's next?` · `hottest prospects` · `follow-ups due` · `summarise today`
- `log called Standish Heating, gatekeeper, try after 4` → then `undo`
- Tap the **one-tap outcome buttons** on a call card (ANSWERED / GATEKEEPER / INTERESTED…).
- **RUN NOW** on each agent → watch the Agent Ops feed update.

---

## TOMORROW — before the founders start calling

1. **`/mission-control` → Wipe demo** (footer button, red). Deletes ONLY demo rows (`data_mode='demo'`).
   Real data is never touched. Confirm the queues go empty.
2. **Import the real prospect list** — in the console:
   ```
   scout wigan plumber
   Joe's Plumbing, 07700 900111, Wigan
   Spark Electric, 01942 000000, Leigh
   ...paste the whole list, one per line: name, phone, town...
   ```
   It dedupes, ranks (mobile + emergency trade + proximity), and splits across D and L.
3. **Save the capture link to both phones.** Create a real client first (console:
   `convert <won prospect> to client`, or use the demo link to show prospects on calls).
4. (If using Telegram) the **08:00 briefing** lands automatically: D's + L's top calls,
   follow-ups due, leads captured yesterday, trials ending, MRR, top-3 actions. Or hit
   **Run daily briefing** in the footer any time.

---

## What's automated vs. manual
- **Automated:** ranking, dedupe, call queues, follow-up drafts, trial monitoring, MRR,
  daily 08:00 briefing, AI lead summaries, agent activity feed.
- **Manual (by design — nothing auto-contacts anyone):** the actual calls, sending any
  follow-up message (JARVIS only drafts), converting a prospect to a paying client.
- **Not built yet (future):** Twilio voice / SMS / call diversion. Leads already carry a
  `source` field (`web_form` now, `missed_call` later) so it bolts on without a rewrite.

## If something's wrong
- **/mission-control says "DATABASE NOT INITIALISED"** → step 1 wasn't run (or failed). Re-run the SQL.
- **Console says "AI OFFLINE — RAW MODE"** → `ANTHROPIC_API_KEY` missing/invalid; commands
  still work on deterministic parsing.
- **No Telegram** → `TELEGRAM_BOT_TOKEN` / `FOUNDER_CHAT_IDS` not set (step 2). Web cockpit is unaffected.
