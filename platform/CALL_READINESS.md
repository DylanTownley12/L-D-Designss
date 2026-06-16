# Call Readiness — run this the night before / morning of calls

Plain steps to get the call list fresh, previews working with real photos, and the
payment link confirmed. Copy-paste each command. Set `BASE` once:

```bash
BASE="https://l-d-designss-production.up.railway.app"
```

These barber-path endpoints are **not** ops-key gated, so no key needed.

---

## 1. Agents — are they alive? (30 seconds)

```bash
curl -s "$BASE/api/agents/status" | jq '.counts, .agents[]?|{name,last_run,status}'
```

✅ **Pass:** `lead_finder`, `website_analyzer`, `lead_enricher`, `preview_generator`
are not `error`/`stale`.
❌ **Fail:** if any show `error`, pull the log:

```bash
curl -s "$BASE/api/agents/logs?agent=lead_finder&limit=10" | jq '.'
```

---

## 2. Fresh leads (only if the list is thin)

The scheduler already runs these every morning (06:00 finder → 06:05 enricher →
06:30 previews, Europe/London). To force them now, run in order and wait a minute
between each:

```bash
curl -s -X POST "$BASE/api/agents/run" -H 'Content-Type: application/json' -d '{"agent":"lead_finder"}'
curl -s -X POST "$BASE/api/agents/run" -H 'Content-Type: application/json' -d '{"agent":"website_analyzer"}'
curl -s -X POST "$BASE/api/agents/run" -H 'Content-Type: application/json' -d '{"agent":"lead_enricher"}'
```

✅ **Pass:** each returns `"status":"started"`. They run in the background — check
`/api/agents/logs` after a few minutes.

---

## 3. Real Google photos on the previews (the big conversion lever)

```bash
curl -s -X POST "$BASE/api/previews/backfill-photos?limit=25" | jq '.'
```

Pulls each top lead's own shop photos from Google. Costs a little Google Places
budget, so it's on-demand only. Idempotent — safe to re-run; add `&force=true` to
re-pull.

---

## 4. Rebuild the previews so they USE those photos

```bash
curl -s -X POST "$BASE/api/previews/regenerate-call-board?limit=25" | jq '.'
```

This re-renders the preview HTML. After this the previews show the shop's real
photos **and** the corrected **£199 + £29/mo** offer (the old £150/£15/£75 deposit
wording is gone in this build).

---

## 5. Eyeball the call list

```bash
curl -s "$BASE/api/calls/board?limit=100" | jq '.leads[] | {business_name, phone, no_website, call_ready, has_real_photos, preview_url}'
```

For each top lead check:
- `phone` present, `no_website: true`, `call_ready: true`
- `has_real_photos: true` (their own photos), `preview_url` opens and looks right

Open a few `preview_url`s on your phone — confirm correct name, photos load, mobile
looks sharp, and the price reads **£199 to launch + £29/month**.

The dashboard does this visually: open the site, you land on **CALLS**, hit the
**● Ready to call** filter for the clean list.

---

## 6. Payment link — confirm it works and is the right price

Grab any lead id from step 5, then:

```bash
LEAD_ID="paste-an-id-here"
curl -s -X POST "$BASE/api/payments/create-checkout/$LEAD_ID" | jq '.checkout_url'
```

Open the URL. ✅ **Pass:** Stripe checkout shows **£199 website build** + **£29/month**
(hosting, updates, booking), card entry, no contract. ❌ **Fail:** if it 503s,
`STRIPE_SECRET_KEY` is missing in Railway → Variables.

In the dashboard this is the green **"Send £199 + £29/mo Link"** button on a lead
once it's marked Interested.

---

## Quick readiness checklist

- [ ] Agents healthy (step 1)
- [ ] Enough fresh leads with phones (step 5 count)
- [ ] Top leads `call_ready: true` and `has_real_photos: true`
- [ ] Previews open, correct name/photos, mobile sharp, price £199 + £29
- [ ] Payment link opens and reads £199 + £29/mo
