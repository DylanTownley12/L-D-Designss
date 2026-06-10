# SETUP — Trades Lead-Capture Product + JARVIS

This covers the **missed-call / text-back product** sold to trades and the
**JARVIS** Telegram operator that runs the sales motion. Both live in the
existing FastAPI backend (`platform/backend`) and React frontend
(`platform/frontend`) and share the same Supabase database.

---

## Architecture note (read this first)

The brief said "Vercel cron" and Next.js-style `/api/...` routes. Your stack is
**FastAPI on Railway + APScheduler + a Vite SPA on Vercel + Supabase**, so it's
built the way your system actually works:

| Brief said | Built as |
|---|---|
| `POST /api/telegram` (Next.js route) | FastAPI route `POST /api/telegram` (`api/jarvis.py`) |
| `POST /api/agents/scout` | FastAPI route (`api/agents.py`) + `POST /api/sales/scout` |
| Vercel cron (08:00 / 18:00) | **APScheduler** jobs at 08:00 / 18:00 `Europe/London` (`tasks/scheduler.py`), **plus** `POST /api/cron/morning` & `/api/cron/evening` so an external cron *can* also trigger them |
| New tables | appended to `db/migrations.sql` (idempotent) |

Nothing new to deploy beyond your normal Railway (backend) + Vercel (frontend) push.

---

## 1. Run the database migration

Supabase → **SQL Editor** → paste **all of** `platform/backend/db/migrations.sql`
→ **Run**. It's idempotent (safe to re-run). It adds:

- `captured_leads` — the homeowner enquiries we capture for a client (the product output)
- `prospects` — trade businesses we're **selling to** (the sales pipeline)
- `next_actions` — scheduled follow-ups on a prospect
- `jarvis_log` — every Telegram turn (powers `undo`)
- trial/portal columns on the existing `textback_clients`
  (`plan_status`, `trial_start`, `trial_end`, `dashboard_token`, `capture_token`, …)

> `captured_leads` is deliberately separate from the barber `leads` table — they
> mean different things. Don't merge them.

---

## 2. Environment variables (Railway → Variables)

New variables for this build (see `backend/.env.example` for the full file):

| Var | What | Required |
|---|---|---|
| `ANTHROPIC_API_KEY` | Powers JARVIS + Sales Prep/Follow-up drafts | yes (else falls back to templates / raw data) |
| `CLAUDE_MODEL` | Model id; default `claude-opus-4-8`. **Swap to `claude-fable-5` here when ready** | no |
| `TELEGRAM_BOT_TOKEN` | From @BotFather | yes (for JARVIS) |
| `FOUNDER_CHAT_IDS` | Comma-separated chat ids allowed to use JARVIS | yes (for JARVIS) |
| `FOUNDER_D_CHAT_ID` / `FOUNDER_L_CHAT_ID` | Per-founder chat ids so 08:00 lists route correctly | recommended |
| `OPS_KEY` | Gate for `/ops`, `/api/sales/*`, `/api/cron/*`, `/api/agents/scout`. Falls back to `SECRET_KEY` | recommended |
| `FRONTEND_BASE_URL` | Base for capture/dashboard links (default `https://l-d-designss.vercel.app`) | no |

SMS sending uses your **existing** TextMagic/Twilio config (`config.py`).

---

## 3. Set up the JARVIS Telegram bot

1. In Telegram, message **@BotFather** → `/newbot` → copy the **token** →
   set `TELEGRAM_BOT_TOKEN` in Railway.
2. Open a chat with your new bot and send it any message.
3. Find your **chat id**: visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and read `message.chat.id`.
   Put it in `FOUNDER_CHAT_IDS` (and `FOUNDER_D_CHAT_ID`). Repeat for L.
4. **Register the webhook** (after Railway redeploys with the vars set). Either:
   - `curl -X POST "https://l-d-designss-production.up.railway.app/api/jarvis/set-webhook?key=<OPS_KEY>"`
   - or directly:
     `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://l-d-designss-production.up.railway.app/api/telegram"`
5. Check it: `GET /api/jarvis/ping` → `{ telegram_enabled: true, model: "...", founders: N }`.

Only chat ids in `FOUNDER_CHAT_IDS` get a reply — everyone else is ignored.

---

## 4. Hook up a client's missed calls (Twilio)

The product texts a homeowner back when the trade misses their call. In Twilio,
for the client's number, set the **call handler / "no answer" / status callback**
to POST to:

```
https://l-d-designss-production.up.railway.app/api/textback/webhook/missed-call/<CLIENT_ID>
```

Twilio posts `From=<caller>`; we text them back **and** create a `captured_lead`
(so it shows on the client's dashboard and pings you on Telegram).

> No Twilio yet? The **capture form** (step 5) gives you the full
> phone → Telegram → dashboard loop without any phone wiring.

---

## 5. Create your first client

```bash
curl -X POST "https://l-d-designss-production.up.railway.app/api/sales/clients?key=<OPS_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"business_name":"EP 24/7 Plumbing","owner_name":"Eddie","phone":"07542668944","town":"St Helens","trade":"plumber","monthly_fee":49}'
```

Returns the live links:

```json
{
  "client_id": "…",
  "capture_url":   "https://l-d-designss.vercel.app/capture/<capture_token>",
  "dashboard_url": "https://l-d-designss.vercel.app/d/<dashboard_token>",
  "missed_call_webhook": "https://…/api/textback/webhook/missed-call/<client_id>"
}
```

Give the **capture_url** out (or embed it on their demo site); give the client
the **dashboard_url**; point Twilio at the **missed_call_webhook**.

You can also create a client by converting a **won** prospect — `convert_to_client`
via JARVIS, or `POST /api/sales/prospects/{id}/convert`.

---

## 6. The daily rhythm (automatic)

APScheduler runs these `Europe/London` (already wired in `tasks/scheduler.py`):

- **08:00** — Dial Manager posts each founder's ordered call list, Revenue
  Reporter posts yesterday's numbers (weekly version on Mondays) → Telegram.
- **18:00** — Follow-up agent DRAFTS chase messages (quiet prospects, trial
  day-7/12 check-ins, captured leads still `new` after 24h) → Telegram for you
  to copy & send.

Trigger them by hand any time:
`POST /api/cron/morning?key=<OPS_KEY>` · `POST /api/cron/evening?key=<OPS_KEY>`.

---

## 7. The five sales agents (via JARVIS or the Ops Board)

| Agent | JARVIS | HTTP |
|---|---|---|
| Lead Scout | "scout wigan plumber" + paste a list | `POST /api/sales/scout` · `POST /api/agents/scout` |
| Sales Prep | "prep Joe's Plumbing" | `POST /api/sales/prospects/{id}/prep` |
| Dial Manager | "today" / "who's next" | `POST /api/sales/dial-today` |
| Follow-up | "follow ups" | `POST /api/sales/followup` |
| Revenue Reporter | "status" / "report" | `GET /api/sales/report` |

The **Ops Board** is at `/ops` on the dashboard (enter the ops key once).

---

## Hard rules (enforced in code)

- **No autonomous outbound contact.** Scout only builds the list; Follow-up only
  drafts; JARVIS/agents never message a prospect or client. You copy & send.
  (The product's text-back to a *homeowner* is the one exception — that's the
  service the client pays for, and it only replies to people who called them.)
- **Founders only** on everything internal (Telegram chat-id allowlist; ops key
  on the board, sales, cron and scout endpoints).
- **JARVIS = one Claude call per message, no loops.** Reads are answered from
  preloaded context; writes go through tools and are echoed back. If Claude is
  down, JARVIS replies with a raw data dump — it never dies.
