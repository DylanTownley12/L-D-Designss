# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Repo Is

L&D Designs — a solo web design agency targeting UK barber shops with no website. The repo contains two things:

1. **Root-level files** — the public-facing portfolio site (`index.html`, `pricing.html`, `showcase.html`), client demo site (`boys-line/`), and legacy Google Colab notebooks for lead finding and outreach
2. **`platform/`** — a full-stack agency automation platform (FastAPI backend + React frontend)

The Colab notebooks (`.ipynb` files at the root) are the old manual workflow. The `platform/` folder is the new automated system that replaces them.

## Platform Architecture

The platform is split into backend and frontend with no shared code between them.

### Backend (`platform/backend/`)

FastAPI app started with:
```bash
cd platform/backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Requires a `.env` file — copy from `.env.example`. The app won't start without `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `OPENAI_API_KEY`, `GMAIL_ADDRESS`, and `GMAIL_APP_PASSWORD` set.

**How data flows:**
- `main.py` registers all routers under `/api` prefix and mounts `static/previews/` for serving generated HTML files
- `config.py` — single `Settings` object loaded from `.env`, imported directly by agents and API modules
- `db/client.py` — singleton Supabase client, imported as `from db.client import get_db`
- `models/schemas.py` — all Pydantic models used across API routes

**Agent pipeline** (each agent has a single `run()` entry point):
1. `lead_finder.py` — scrapes Yell.com, saves to `leads` table, deduplicates by name+city
2. `website_analyzer.py` — HTTP checks on lead websites, sets `website_status` and `quality_score`
3. `preview_generator.py` — renders `templates/barber_site.html` via Jinja2, saves HTML to `static/previews/`, stores URL in `previews` table
4. `outreach_writer.py` — calls OpenAI `gpt-4o-mini`, returns `{subject, body}` for email or `{body}` for SMS
5. `qc_agent.py` — validates message before sending, checks for spam phrases, missing contact info, broken preview URLs
6. `outreach_sender.py` — Gmail SMTP for email, Twilio for SMS; enforces daily rate limits from config
7. `followup_agent.py` — checks `follow_up_sequences` table, queues Day 3/7/14 messages for active sequences
8. `notification_agent.py` — creates rows in `notifications` table, emails the founder on reply

`tasks/scheduler.py` runs agents on a schedule via APScheduler (starts on app startup via lifespan).

**Lead status flow:**
`new` → `analyzing` → `preview_ready` → `outreach_queued` → `outreach_sent` → `replied` → `interested` → `converted`

Statuses `not_interested` and `do_not_contact` are terminal — follow-up sequences stop automatically when a lead reaches these or `replied`/`converted`.

### Frontend (`platform/frontend/`)

React + Vite + Tailwind. Started with:
```bash
cd platform/frontend
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build to dist/
```

All API calls go through `src/api/client.js` which wraps axios. The base URL is `VITE_API_URL` env var (falls back to `/api` for when frontend and backend are on the same origin). The Vite dev server proxies `/api` to `localhost:8000`.

Custom Tailwind colors: `gold` (#C9A84C), `gold-light`, `dark`, `dark-2`, `dark-3`. When using these in `@apply` inside CSS files, avoid hyphenated names — use plain CSS values instead (known PostCSS parsing issue).

### Database

Supabase (PostgreSQL). Schema is in `platform/backend/db/migrations.sql` — run this once in the Supabase SQL Editor to create all tables, indexes, and triggers.

Key tables: `leads`, `previews`, `outreach_messages`, `follow_up_sequences`, `notifications`, `deployed_websites`, `agent_logs`.

### Deployment

- **Backend** → Render.com (root dir: `platform/backend`, build: `pip install -r requirements.txt`, start: `uvicorn main:app --host 0.0.0.0 --port $PORT`)
- **Frontend** → Vercel (root dir: `platform/frontend`, framework: Vite, add `VITE_API_URL` env var pointing to Render URL)
- **Config** → `platform/vercel.json` needs updating with the actual Render backend URL for API rewrites

### Webhooks

Twilio SMS replies hit `POST /api/webhooks/twilio/sms` — configure this URL in the Twilio console. Manual WhatsApp replies are logged via `POST /api/webhooks/manual-reply/{lead_id}`. Both trigger `notification_agent.notify_reply_received()` and stop the follow-up sequence.

## Root-Level Files

The portfolio/public-facing pages (`index.html`, `pricing.html`, `showcase.html`, `boys-line/`) are deployed via GitHub Pages at `dylantownley12.github.io/L-D-Designss`. These are standalone HTML files with no build step — edit directly and push to deploy.

`generator.html` is a standalone client website generator tool — fills a barber site template from form inputs and downloads the result.

The root `requirements.txt` and `run.bat`/`run.sh` are legacy files from before the platform was built.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
