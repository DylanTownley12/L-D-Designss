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
