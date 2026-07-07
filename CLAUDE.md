# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

L&D Designs — a solo web design agency selling websites to UK tradespeople (plumbers, electricians, heating/gas engineers, roofers, drainage) with no website. Offer: **£199 to launch + £29/month** (hosting, updates, booking system). Pivoted from barber shops to trades in June 2026. The repo contains:

1. **Root-level files** — public-facing portfolio site (`index.html`, `pricing.html`, `showcase.html`), client demo (`boys-line/`), and legacy Google Colab notebooks (old manual workflow, superseded by `platform/`)
2. **`platform/`** — full-stack agency automation platform (FastAPI backend + React frontend)
3. **`.claude/skills/`** — UI/UX Pro Max design-intelligence skill suite (committed; loads in every session). Use it for ALL UI work: previews, dashboard, public site. Shopify store work (side-hustle stores, client stores) MUST go through `shopify-store-standards` — the anti-slop quality contract. The Shopify MCP connector (claude.ai web sessions) gives direct access to Dylan's store for products, collections, pages, and unpublished-theme edits.

## Founder working style (Dylan)

- Plain English, no jargon — he's often reading on his phone at work. Lead with the TLDR.
- Ship fast. "Merge it" = merge to main, which auto-deploys (Railway backend, Vercel frontend).
- He can't run code locally to review — send rendered HTML files / screenshots for visual checks.
- The ONLY prices allowed anywhere prospect-facing: £199 and £29 (QA gate enforces this).
- Outreach voice: a Wigan tradesman texting a mate — short, plain, "mate", zero marketing speak.
- Another Claude session may be pushing to main concurrently — always fetch before merging.

## Current state (June 2026)

- **Preview engine**: v3 ("£1,500-feel", `agents/preview_qa.py`) — variant-seeded heroes, ticker, stat band, dark quote slab. Phased rollout: `POST /api/sales/v3/build?limit=3` → review → `limit=999` → per-prospect `POST /api/sales/prospects/{id}/v3/promote`. Rebuilds keep URLs stable; bulk builds skip promoted pages; a failing rebuild never overwrites a promoted page. Previews are stored HTML snapshots — design changes need a rebuild to show.
- **Payments**: Stripe checkout for £199+£29/mo + webhooks + live-viewer intent alerts (shipped June 12).
- **OpenClaw watchdog**: backend `openclaw_watchdog` job (30min) alerts founders via Telegram/Gmail if the team leaves no DB trace for `OPENCLAW_SILENCE_HOURS` (3h). Chief's hourly `GET /api/team/chief/health` doubles as the heartbeat; explicit pings: `POST /api/team/heartbeat`. Machine-side 24/7 setup: `platform/OPENCLAW_24x7.md`.

## Dev Commands

```bash
# Backend
cd platform/backend
pip install -r requirements.txt
uvicorn main:app --reload          # dev server at localhost:8000
# Requires .env — copy .env.example and fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, GMAIL_ADDRESS, GMAIL_APP_PASSWORD

# Frontend
cd platform/frontend
npm install
npm run dev        # dev server at localhost:5173 (proxies /api → localhost:8000)
npm run build      # production build to dist/
```

No test suite exists — verify changes by running the backend and checking `/docs` (auto-generated FastAPI Swagger UI).

## Deployment

- **Backend** → Railway (`platform/backend`, start: `uvicorn main:app --host 0.0.0.0 --port $PORT`). Live: `https://l-d-designss-production.up.railway.app`
- **Frontend** → Vercel (`platform/frontend`). Live: `https://l-d-designss.vercel.app`
- **DB** → Supabase. Schema: `platform/backend/db/migrations.sql` — run once in Supabase SQL Editor.

## Architecture

### Backend (`platform/backend/`)

`main.py` registers all routers under `/api` and starts the APScheduler via lifespan. Routes:

| Module | Prefix | Purpose |
|---|---|---|
| `api/agents.py` | `/api/agents` | Run/status for the 12 backend Python agents |
| `api/team.py` | `/api/team` | Coordination layer for the 9 OpenClaw agents |
| `api/leads.py` | `/api/leads` | CRUD for lead records |
| `api/outreach.py` | `/api/outreach` | Message queue management |
| `api/previews.py` | `/api/previews` | Preview generation + URL fixing |
| `api/ops.py` | `/api/ops` | Blockers, action queue, DO NEXT |
| `api/payments.py` | `/api/payments` | Stripe checkout links |
| `api/n8n.py` | `/api/n8n` | n8n webhook receiver |
| `api/strategy.py` | `/api/strategy` | Claude vs GPT strategy debate |
| `api/webhooks.py` | `/api/webhooks` | Twilio SMS + manual WA reply |

Preview HTML is served at `/previews/serve/{id}` (not under `/api`) directly from `previews.html_content` in the DB — no static file mount.

### The Two Agent Systems (critical — don't confuse them)

**System 1: Backend Python agents** (12 agents, `platform/backend/agents/`)
Run on a schedule via APScheduler (`tasks/scheduler.py`). Each has a `run()` entry point. The pipeline:
`lead_finder` → `website_analyzer` → `preview_generator` → `outreach_writer` → `qc_agent` → `outreach_sender` → `followup_agent`

Supporting agents: `ceo_agent` (hourly health + self-heal), `lead_enricher`, `preview_refresher`, `notification_agent`, `chat_agent`, `orchestrator`, and frozen agents (`cmo_agent`, `research_agent`, `analyst_agent`, `sales_agent`, `dev_agent`, `claude_agent`).

**System 2: OpenClaw agents** (9 agents, `~/.openclaw/workspaces/`)
LLM agents (Claude Haiku) that run via `openclaw cron` and call the backend over HTTP. They never touch the DB directly — only via `/api/team/*` endpoints. Agents in daily handoff order: `scout` → `gap` → `judge` → `maker` → `reach` → `executor` → `closer` → `profit` → `chief`.

`executor` queues WA + email directly via `POST /api/team/executor/queue` (no approval gate, capped at `MAX_WHATSAPP_PER_DAY`). Everything else (Instagram, Stripe) is staged as an approval row for the founder.

`chief` runs hourly: calls `GET /api/team/chief/health`, then `POST /api/team/chief/fix` if fixable, or queues a WA alert to the founder if not.

Dashboard pages: `/agents` = WORKFORCE (12 backend Python agents, powered by `/api/agents/*`) and `/hub` = WAR ROOM (9 OpenClaw agents, powered by `/api/team/*`). These are entirely separate.

### Database Client (`db/client.py`)

**Critical:** this is a custom `httpx`-based PostgREST client — do NOT replace with `supabase-py`. The API mimics the supabase-py query builder (`.table().select().eq().execute()`) but is implemented from scratch to avoid the supabase-py dependency. All DB access goes through `from db.client import get_db`.

### Safety Layer (`safety.py`)

Wraps all scheduled jobs that spend money or send messages. Three mechanisms:
- **Spend cap** — `DAILY_SPEND_CAP_GBP` (default £2/day); guarded jobs block when breached
- **Kill-switch** — alerts (or pauses) if no revenue for `SAFETY_KILL_SWITCH_DAYS` days
- **Channel caps** — `MAX_WHATSAPP_PER_DAY=10` (ban protection), `MAX_INSTAGRAM_PER_DAY=20`, `MAX_EMAILS_PER_DAY=50`

Use `@safety.guarded("job_name")` on new scheduled jobs that spend. Use `safety.can_send(channel)` before outreach sends. `safety.record_spend(agent, model, tokens_in, tokens_out)` logs LLM cost after every API call.

### Config (`config.py`)

Single `Settings` object loaded from `.env` via pydantic-settings. Always import as `from config import settings`. Key production vars set in Railway: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `PREVIEW_BASE_URL`, `GOOGLE_PLACES_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

### Lead Status Flow

`new` → `analyzing` → `preview_ready` → `outreach_queued` → `outreach_sent` → `replied` → `interested` → `converted`

Terminal statuses: `not_interested`, `do_not_contact` — follow-up sequences stop automatically.

### Scheduler (`tasks/scheduler.py`)

APScheduler starts on app startup. Key times (Europe/London):
- 5:50am — seed 9-agent team backlog
- 5:55am — morning health check
- 6:00am — lead finder, 6:05am — enricher, 6:30am — preview generator
- 7:00am — WA campaign, 7:15am — Instagram campaign
- 8:00am — CEO daily briefing email
- 9:00am — follow-ups
- Every 1h — CEO health check + auto-fix
- Every 2h — website analyzer, refill queues, strategy brief
- Every 30min — email send queue, self-healing retry

### Frontend (`platform/frontend/`)

React + Vite + Tailwind. All API calls go through `src/api/client.js` (axios wrapper). `VITE_API_URL` env var sets the backend URL (falls back to `/api`). Vite proxies `/api` → `localhost:8000` in dev.

Design system: JARVIS-style dark UI with inline styles (not Tailwind classes). Colors: `#0a0a0a` background, `#00d4ff` / `#00ff88` cyan/green accents, `rgba(0,212,255,0.1)` panel borders. All pages use inline styles consistently — do not revert to Tailwind classes on existing pages.

Custom Tailwind colors: `gold` (#C9A84C). Avoid hyphenated color names in `@apply` (PostCSS parsing issue).

### OpenClaw (`~/.openclaw/`)

Baz is the main WhatsApp agent (`~/.openclaw/workspace/`). The 9 growth agents each have `~/.openclaw/workspaces/<name>/` with: `SOUL.md` (identity + brief), `TOOLS.md` (exact curl commands), `AGENTS.md`, `MEMORY.md`, `HEARTBEAT.md`.

**Session stability rules:** never close the TUI terminal (causes status 440 conflict), never open WhatsApp Web in a browser. If 440 occurs: `openclaw channels login --channel whatsapp` to rescan QR.

Restart gateway: `systemctl --user restart openclaw-gateway.service`
