# TESTING — Trades Lead-Capture Product + JARVIS

Two layers: **what was verified locally** (here, now) and **the live acceptance
tests** you run against the deployed URL once the env vars are set.

---

## A. Verified locally (no secrets needed)

```bash
# 1. Pure sales logic — ranking, dedupe, phone normalisation, trial maths
cd platform/backend && python3 tests/test_trades_logic.py
#   → 10/10 trades-logic tests passed

# 2. Whole backend compiles under Python 3
cd platform/backend && python3 -m py_compile main.py config.py api/*.py agents/*.py utils/*.py tasks/*.py db/*.py
#   → (no output = clean)

# 3. Frontend builds with the 3 new pages
cd platform/frontend && npm run build
#   → ✓ built  (Capture, ClientDashboard, Ops all transform)
```

> The end-to-end flow (Supabase + Telegram + Twilio) can't be exercised from a
> dev box without live secrets — that's section B, which runs on Railway.

Set a base + key once for the commands below:

```bash
BASE=https://l-d-designss-production.up.railway.app
KEY=<your OPS_KEY>
```

---

## B. Live acceptance tests (the "Done when" list)

### 0. Provision a test client

```bash
curl -s -X POST "$BASE/api/sales/clients?key=$KEY" -H 'Content-Type: application/json' \
  -d '{"business_name":"Test Plumbing","phone":"07000000000","town":"Wigan","trade":"plumber"}'
# → note capture_url, dashboard_url, missed_call_webhook + the tokens
CAP=<capture_token>; DASH=<dashboard_token>
```

### 1. ✅ Capture form works end-to-end: **phone → Telegram → dashboard**

```bash
# Submit an enquiry through the public form API (or open capture_url in a browser)
curl -s -X POST "$BASE/api/capture/$CAP" -H 'Content-Type: application/json' \
  -d '{"name":"Sarah","phone":"07712345678","postcode":"WN1 1AA","job_description":"Leaking boiler"}'
# → {"ok":true,"message":"Thanks! …"}
```
- **Telegram:** founders get `📞 NEW LEAD for Test Plumbing (web form) … Dashboard: …`
- **Dashboard:** open `dashboard_url` (or `GET $BASE/api/portal/$DASH`) → the
  enquiry appears with status `new`; flip it through new→contacted→won.
- **Missed call variant:** `POST $BASE/api/textback/webhook/missed-call/<client_id>`
  with form field `From=07712345678` → texts the caller back **and** creates the
  same dashboard lead.

### 2. ✅ From Telegram — morning call list

First load some prospects (see test 6), then DM JARVIS: **`today`**
→ replies with D's and L's ordered lists (overdue actions first, then ranked).
Or fire the job: `curl -s -X POST "$BASE/api/cron/morning?key=$KEY"`.

### 3. ✅ Ask who's next

DM JARVIS: **`who's next`** → top prospect with phone + call notes + reason.

### 4. ✅ Log a call

DM JARVIS: **`log Test Plumbing — keen, wants a demo Thursday`**
→ `Logged Test Plumbing → demo_booked. Next: Run the demo (by …). 📝 Prep notes generated.`
Then **`undo`** → reverts it. (Echo confirms every DB write.)

### 5. ✅ Get a drafted follow-up

DM JARVIS: **`draft a follow-up for Test Plumbing`**
→ a short UK-tone message you can copy & send. (JARVIS drafts; it never sends.)

### 6. ✅ Run Scout on a pasted list

DM JARVIS (paste straight in):
```
scout wigan plumber
Joe's Plumbing, 07504 683058, Wigan
Spark Electrical, 01942 123456, Leigh
AB Heating  07700900123  Bolton
```
→ `Added 3 prospect(s) (D:2 / L:1), 0 duplicates skipped.` + ranked top list.
HTTP equivalent: `POST $BASE/api/agents/scout` or `$BASE/api/sales/scout`
with `{"pasted_text":"…","town":"Wigan","trade":"plumber"}`.

### 7. ✅ Pull a status report

DM JARVIS: **`status`** (or `report` / `weekly report`)
→ dials yesterday, pipeline, trials live (days left + leads each), paying, MRR,
churn-risk flags. HTTP: `GET $BASE/api/sales/report?key=$KEY`.

---

## C. The Ops Board

Open `https://l-d-designss.vercel.app/ops` → enter the **ops key** once → live
pipeline, revenue snapshot, Scout box, both founders' call lists with inline
call-logging + prep, trials with churn flags, and the recent captured-leads feed.
Buttons fire the 08:00 / 18:00 jobs.

---

## D. Resilience checks

- **Claude offline / no key:** JARVIS still answers — `status`, `today`,
  `trial` return real data with an `⚙️ (AI offline — raw data)` prefix.
- **Telegram not configured:** the rest of the platform is unaffected; sends
  log a warning and no-op.
- **Non-founder messages the bot:** silently ignored (no reply).
- **Duplicate Telegram delivery:** de-duped by message id.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| JARVIS silent | `GET /api/jarvis/ping`; webhook set? chat id in `FOUNDER_CHAT_IDS`? |
| `401 Invalid ops key` | `OPS_KEY` (or `SECRET_KEY`) matches the `?key=` you sent |
| No Telegram on new lead | `TELEGRAM_BOT_TOKEN` + `FOUNDER_CHAT_IDS` set; check logs |
| Migration errors | re-run `db/migrations.sql` — it's idempotent |
| Scout inserts dupes | dedupe is by normalised phone; entries with no phone dedupe by name |
