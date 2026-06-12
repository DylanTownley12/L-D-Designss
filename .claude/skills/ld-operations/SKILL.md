---
name: ld-operations
description: "Operating L&D Designs day to day. Use for: 'what's next today', system status checks, the action queue and blockers, running the v3 preview rollout, deploys and merges to main, OpenClaw team health, watchdog alerts, WhatsApp/gateway incidents, scheduler questions, safety caps. The runbook for keeping the revenue machine moving."
---

# L&D Operations Runbook

One founder (Dylan), two agent systems, one goal: £199 + £29/mo website clients.
This skill is how sessions operate the machine without being re-briefed.

## Morning flow ("what's next today")

1. `GET /api/ops/action-queue` — priority order is built in: **hot leads first**
   (replied/interested — respond same hour), then overdue follow-ups, then
   queued WA/IG sends ready to fire
2. `GET /api/ops/blockers` — revenue-stopping issues with fix buttons
3. `GET /api/ops/proof` — did the system actually DO anything today (real DB
   counts, agent liveness by effect)
4. 8am CEO briefing email + Mission Control (`/`) and War Room (`/hub`)

## Key endpoints (backend: l-d-designss-production.up.railway.app)

- v3 previews: `POST /api/sales/v3/build?limit=3` (samples) / `limit=999` (all),
  `GET /api/sales/v3/status`, `POST /api/sales/prospects/{id}/v3/promote` —
  all need the founder ops key
- Team: `GET /api/team/chief/health` (doubles as heartbeat),
  `POST /api/team/heartbeat` (explicit liveness ping), `GET /api/team/control-room`
- Previews serve at `/previews/serve/{id}` — stored HTML snapshots; design
  changes require a rebuild to show

## Deploys & git (multiple Claude sessions run concurrently!)

- Develop on the session branch; **"merge it" from Dylan = merge to main**,
  which auto-deploys (Railway backend ~2-3 min, Vercel frontend)
- **ALWAYS `git fetch origin main` before merging** — other sessions push to
  main at the same time (proven 12 Jun: a payments commit landed mid-merge)
- Never push main without Dylan's word for THAT change. Beware: `git push |
  tail` masks push failures — check `git log origin/main` after pushing.

## The two agent systems (don't confuse them)

- **Backend Python agents** (12, APScheduler, Railway): lead_finder 6am →
  enricher → previews 6:30 → WA campaign 7am → follow-ups 9am; CEO hourly.
  Dashboard: `/agents` (WORKFORCE).
- **OpenClaw agents** (Baz + 9, Dylan's home machine, via `/api/team/*` only):
  scout→gap→judge→maker→reach→executor→closer→profit→chief. Dashboard: `/hub`
  (WAR ROOM). 24/7 machine setup: `platform/OPENCLAW_24x7.md`.

## Safety rails (never bypass)

- Channel caps: WhatsApp 10/day (ban protection), IG 20/day, email 50/day
- Spend cap `DAILY_SPEND_CAP_GBP` (£2/day default); kill-switch on no-revenue
- Agents NEVER contact prospects autonomously outside the executor's capped
  queue — everything else stages an approval row for the founder
- New scheduled jobs that spend/send: wrap with `@safety.guarded("job_name")`

## Incident playbook

| Symptom | Fix |
|---|---|
| 🔴 watchdog "OpenClaw DOWN" alert | On the machine: `systemctl --user restart openclaw-gateway.service`; recovery auto-notifies |
| WhatsApp status 440 | `openclaw channels login --channel whatsapp`, rescan QR. Never close the TUI; never open WA Web in a browser |
| Preview looks broken/old | It's a snapshot — rebuild it (promoted pages need per-prospect rebuild, never bulk) |
| /status or /proof timing out | agent_logs missing indexes — run the SQL from `GET /api/ops/db-maintenance-sql` in Supabase once |
| WA queue empty but leads ready | `POST /api/agents/run {"agent":"whatsapp_campaign"}` (blockers endpoint has the button) |
| Lead replied, nobody answered | Top of action queue — draft reply in wigan-outreach-voice, alert Dylan |

## Founder interface rules

- Dylan reads on his phone at work: TLDR first, plain English, no jargon
- He can't run code: send rendered HTML files or screenshots for anything visual
- Prospect-facing prices are £199 and £29 ONLY — everywhere, always
