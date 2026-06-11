# TESTING — JARVIS trades system (production acceptance)

All against **production**. Set once:
```bash
BASE=https://l-d-designss-production.up.railway.app
FE=https://l-d-designss.vercel.app
KEY=<your OPS_KEY>
```

## Pre-req (founder, ~3 min)
Run `backend/db/PASTE_INTO_SUPABASE.sql` in Supabase SQL Editor. Verification SELECTs at
the bottom must list 8 tables. Then in `/jarvis` hit **Seed demo**.

## The 12 acceptance tests
| # | Test | How |
|---|---|---|
| 1 | Migration applied | SQL verification SELECTs list 8 tables (or it's the founder's pending step) |
| 2 | Seed visible in /jarvis | open `/jarvis`, enter key → D/L queues, tasks, leads populated |
| 3 | Capture loads at phone width | open `/capture/<token>` on a phone — one-handed, big targets |
| 4 | Submit with photo → lead row | submit the form with a photo; row has `photo_urls` (📷 in the panel) |
| 5 | Founders' Telegram alert | (needs `TELEGRAM_BOT_TOKEN`+`FOUNDER_CHAT_IDS`) alert arrives on submit |
| 6 | Client dashboard shows lead | open `/d/<token>` → the new lead is listed |
| 7 | /jarvis on real data | every panel populated, system dot green |
| 8 | RUN NOW per agent → events | click RUN NOW (Lead Prioritiser/Follow-Up/Revenue Analyst); feed updates |
| 9 | "what should D and L do now?" | console returns a data-grounded answer; logged to `decisions` |
| 10 | one-tap outcome updates instantly | tap GATEKEEPER on a card → status flips, feed logs it |
| 11 | `log called <prospect>, gatekeeper, try after 4` | row updated, change echoed; `undo` reverts |
| 12 | manual cron → Telegram briefing | `POST $BASE/api/cron/morning?key=$KEY` → briefing (Telegram if configured) |

## Curl checks (no browser)
```bash
# Routing + gating (no key → 401, bad token → 404). Proves deploy + auth.
curl -s -o/dev/null -w '%{http_code}\n' "$BASE/api/sales/board"                 # 401
curl -s -o/dev/null -w '%{http_code}\n' "$BASE/api/capture/nope"                # 404
curl -s -o/dev/null -w '%{http_code}\n' -X POST "$BASE/api/sales/wipe-seed"     # 401

# With your key (after migration):
curl -s "$BASE/api/sales/board?key=$KEY" | head -c 300                          # real JSON
curl -s -X POST "$BASE/api/jarvis/command?key=$KEY" -H 'Content-Type: application/json' \
  -d '{"text":"what should D do now?","founder":"D"}'                            # sensible reply
curl -s -X POST "$BASE/api/jarvis/command?key=$KEY" -H 'Content-Type: application/json' \
  -d '{"text":"log called Standish Heating, gatekeeper, try after 4"}'          # row updated + echo
curl -s "$BASE/api/sales/agent-events?key=$KEY" | head -c 300                    # feed
curl -s -X POST "$BASE/api/cron/morning?key=$KEY" | head -c 200                  # daily briefing
```

## Resilience
- **No `ANTHROPIC_API_KEY`** → console answers status/today/log/follow-ups/run on deterministic
  parsing with an "AI OFFLINE — RAW MODE" chip. Never dies.
- **Migration not run** → board returns `setup_needed` (clean message, not a crash); /jarvis shows
  the red "DATABASE NOT INITIALISED" banner.
- **Telegram not configured** → everything else works; sends no-op with a warning.
- **Non-founder hits the bot** → ignored. **Duplicate Telegram delivery** → de-duped by message id.
