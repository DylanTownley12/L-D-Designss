# TESTING — Tradesman Website Revenue OS (production acceptance)

All against **production**. Set once:
```bash
BASE=https://l-d-designss-production.up.railway.app
FE=https://l-d-designss.vercel.app
KEY=<your OPS_KEY>
```

## Pre-req (founder, ~3 min — the one thing that can't be automated)
Railway has no `DATABASE_URL`, so DDL can't self-apply. Paste **`backend/db/PASTE_INTO_SUPABASE.sql`**
into Supabase → SQL Editor → Run. The verification SELECTs at the bottom must list **10 tables**
and `data_mode_cols = 4`. Then in `/mission-control` hit **Seed demo** (demo mode) to rehearse.

## The 9 acceptance tests
| # | Test | How to verify |
|---|---|---|
| 1 | Migration + integrity; seed rows are demo; "wipe demo" works | SQL SELECTs list 10 tables + `data_mode_cols=4`. Board in DEMO shows seeded rows; footer **Wipe demo** (confirm) clears only `data_mode='demo'`. REAL board untouched. |
| 2 | Import 5 real prospects → deduped, scored, angled, queued; incomplete → NEEDS DATA | Console `import` (or `POST /api/sales/import`) a 5-line block. Response gives `queue_ready` + `pct_ready`. A row with no website status lands in **NEEDS DATA**, never a queue. |
| 3 | Every queued prospect shows score + sales angle | Each queue row + the NEXT CALL strip render `score` and `🎯 angle`. |
| 4 | Logging an outcome without a next action is impossible (UI + console) | UI: tapping a non-terminal outcome opens the 2-tap WHEN picker; can't save without it. API: `POST /prospects/{id}/log` with a non-terminal status and no `next_action`/`next_action_date` → **422**. Console `log …` auto-creates a next action (+1 day) and says so. |
| 5 | QA fails a broken preview (reasons listed, blocked from READY) + passes a good one; APPROVE→READY | `build preview <name>` → QA runs. A good page → `qa_passed`; APPROVE flips to **ready**. Break it (e.g. unreachable) → `qa_failed` + reasons, can't be approved. |
| 6 | "brief me" → bottleneck named with real numbers, delivered to OpenClaw | Console `brief me` or `POST /api/sales/brief`. Briefing names the bottleneck stage with counts; `delivery.channel` = `openclaw` when `OPENCLAW_WEBHOOK_URL` is set. |
| 7 | Capture submit end-to-end → lead row + founder notification via OpenClaw | Submit `/capture/<token>` (client OR a prospect preview token). Row appears in CAPTURED LEADS; founders pinged via `notify_founders` (OpenClaw). |
| 8 | `/mission-control` cold load: NEXT CALL populated, alerts visible, old routes redirect | `/jarvis`, `/ops`, `/command` → `/mission-control`. NEXT CALL strip shows the single next prospect; RED ALERT banner shows open alerts. |
| 9 | THE 8AM TEST | Fresh load answers: who to call (NEXT CALL), why (angle), what to show (preview chip), follow-ups due, today's highest-revenue action (CEO briefing). |

## Curl checks (no browser)
```bash
# Routing + gating (no key → 401, bad token → 404). Proves deploy + auth.
curl -s -o/dev/null -w '%{http_code}\n' "$BASE/api/sales/board"                 # 401
curl -s -o/dev/null -w '%{http_code}\n' "$BASE/api/sales/needs-data"            # 401
curl -s -o/dev/null -w '%{http_code}\n' -X POST "$BASE/api/sales/import"        # 401
curl -s -o/dev/null -w '%{http_code}\n' -X POST "$BASE/api/sales/brief"         # 401
curl -s -o/dev/null -w '%{http_code}\n' "$BASE/api/capture/nope"                # 404

# With your key (after the SQL paste):
curl -s "$BASE/api/sales/board?key=$KEY&mode=real" | head -c 300                # real JSON
curl -s -X POST "$BASE/api/sales/import?key=$KEY" -H 'Content-Type: application/json' \
  -d '{"pasted_text":"Joe Plumbing, 07700 900111, Wigan\nSpark Electric, 01942 000000, Leigh"}'
# next-action enforcement → expect 422:
curl -s -o/dev/null -w '%{http_code}\n' -X POST "$BASE/api/sales/prospects/SOMEID/log?key=$KEY" \
  -H 'Content-Type: application/json' -d '{"outcome":"answered","new_status":"called"}'   # 422
curl -s -X POST "$BASE/api/sales/brief?key=$KEY" | head -c 400                  # bottleneck + delivery
```

## Resilience
- **No `ANTHROPIC_API_KEY`** → angles + briefing fall back to deterministic templates; console shows "AI OFFLINE — RAW MODE". Never dies.
- **Migration not run** → board returns `setup_needed` (clean message, CORS intact); Mission Control shows the red "DATABASE NOT INITIALISED" banner.
- **No `OPENCLAW_WEBHOOK_URL`** → notifications fall back to Telegram, else log-only. Everything else works.
- **REAL vs DEMO** → every query is single-mode; the toggle never mixes them. Demo view is amber-bordered.
