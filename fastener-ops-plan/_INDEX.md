# L&D → Fastener Ops Vault — Home

The home and table of contents for the 7-week build plan that turns a manual screw-fastener side-business into an automated, real, order-taking proof-of-concept — and wins Dylan a 25% profit-share.

> [!info]
> This vault is the complete 7-week plan to build a REAL, can-take-orders fulfilment system on a small postable stand-in product that mirrors the dad's screw/fastener business, land real sales, and prove a ~10x faster nightly dispatch — so Dylan can walk into the pitch with proof, not a promise. **How to use it:** read [[00-north-star-and-pitch]] for the why and the bar for "done", then follow the notes in order; when you're ready to build, jump straight to [[10-claude-code-handoff]]. Each note is self-contained and execution-grade — link out, don't duplicate. Every claim here is grounded in the verified the system inventory; where something is genuinely new, it is flagged net-new.

## The North Star

In 7 weeks (solo, 17, UK, lean budget, ~12–15 hrs/week around school), Dylan builds a real, polished, order-taking system on a stand-in fastener product, aims for genuine dispatched sales, and proves a unified order → pick/pack → Royal Mail label → notify loop that makes the dad's nightly grind roughly 10x faster — then pitches **25% of NET profit** for running and automating the dad's business while the dad keeps **75% for doing far less**, retains his supplier, and keeps his eBay/Amazon accounts. The win is measured in proof: one real dispatched sale plus a working 10x loop the dad can watch happen. Full mission, deal, and Definition of Done in [[00-north-star-and-pitch]].

## Current ground truth

> [!warning] The screw business is GREENFIELD — zero code, zero credentials on the dev machine. Everything that touches the marketplaces or Royal Mail is net-new and must be built. The slow external approvals (Amazon SP-API, eBay keyset, Royal Mail Click & Drop) start in Week 1 — see [[08-seven-week-timeline]].

- **Net-new (build from scratch):** eBay Sell API, Amazon SP-API, Royal Mail Click & Drop integration, and ALL order / inventory / SKU / shipping-label / fulfilment code and the database schema.
- **Reusable L&D *patterns* (lift the pattern, never the L&D business logic):** FastAPI (Python 3.11) + a hand-rolled httpx/PostgREST Supabase client + APScheduler + a `safety.py` spend-cap/kill-switch layer; the React 18 + Vite 5 SPA shell + shared axios client; the Stripe checkout + signature-verified webhook flow; the `/api/n8n/*` action(POST)+read(GET) convention. Proven and deployed on Railway / Vercel / Supabase.
- **Reusable assets:** the existing blank Shopify Basic store ("My Store", GBP, UK) + Shopify MCP + `~/.codex` Shopify skills; n8n (revive fresh on Cloud — the local instance is dormant); the Higgsfield MCP for content/ads.
- **Dead / ignore:** OpenClaw / "Baz" / the 9-agent WhatsApp stack is removed — do not plan around it.
- **Bugs NOT to inherit:** split schema (use ONE canonical `schema.sql`), a stale auto-loading CLAUDE.md (write a fresh accurate one), leaked raw exceptions in 500s and inconsistent ops auth (global auth dependency + safe error middleware), and no tests/CI (pytest + CI from Week 1 — this handles real money). Detail in [[01-system-architecture]].

## The vault

| # | Note | What it covers |
|---|---|---|
| 00 | [[00-north-star-and-pitch]] | The mission, the 25/75 deal, value to the dad, the Definition of Done, and the north-star KPIs. Start here. |
| 01 | [[01-system-architecture]] | Full stack, end-to-end data flow, the one canonical schema, reuse-vs-net-new map, hosting, auth + safe error handling. |
| 02 | [[02-shopify-store]] | Branding the existing store, the converting fastener-kit product page, SKUs, payments, Royal Mail checkout rates, VAT, the MCP build path. |
| 03 | [[03-order-fulfilment-automation-n8n]] | The 10x engine: all-channel ingestion → unified queue → pick/pack → Click & Drop labels → dispatch + tracking write-back + buyer notify (with CSV fallback). |
| 04 | [[04-ops-dashboard]] | The NEW React/Vite control panel: orders queue, brother-friendly pick/pack, dispatch, inventory, revenue/margin, the Time-Saved proof, health — with roles + auth. |
| 05 | [[05-content-and-ads-engine]] | The lo-fi demo-led TikTok/Reels formula, the Higgsfield render pipeline, product photography, and UTM tracking back to Shopify. |
| 06 | [[06-agents]] | The focused worker roster (Order-Sync, Dispatch/Label, Customer-Comms, Listing/Content, Analytics, Health/CEO) on the APScheduler + `safety.py` pattern. |
| 07 | [[07-metrics-and-proof]] | What to measure: revenue, margin, the 10x time-saved, SLA, the content funnel — plus realistic 7-week targets and the proof pack for the pitch. |
| 08 | [[08-seven-week-timeline]] | The week-by-week milestones, the critical path, and the cut-order if a week slips. |
| 09 | [[09-the-pitch-pack]] | The slide-by-slide deck, the precise 25%-of-net deal terms, risk-reversal, objection handling, and how to deliver the live pitch. |
| 10 | [[10-claude-code-handoff]] | The build manual: repo layout, dependency-ordered tasks, day-1 conventions, integrations + env vars, and the paste-ready first-session prompt. |

## Master build checklist

Dependency-ordered across the 7 weeks. High-level only — each item links the note that owns the detail; tick the acceptance tests inside those notes.

**Week 1 — Foundations + start the slow clocks** ([[08-seven-week-timeline]], [[10-claude-code-handoff]])
- [ ] Scaffold the NEW `fastener-ops` repo on the L&D patterns with pytest + CI green on commit #1 ([[01-system-architecture]], [[10-claude-code-handoff]]).
- [ ] Author the ONE canonical `schema.sql` (orders + items + skus + inventory + shipments + logs) with `UNIQUE(channel, channel_order_id)`; build a fresh Supabase DB in one run ([[01-system-architecture]]).
- [ ] Add global auth dependency + safe-error middleware before any feature code ([[01-system-architecture]]).
- [ ] Deploy an empty-but-healthy backend to Railway; provision Supabase ([[10-claude-code-handoff]]).
- [ ] File the slow approvals NOW: Amazon SP-API, eBay keyset, Royal Mail Click & Drop ([[08-seven-week-timeline]]).
- [ ] Source the small postable demo product (steam cleaner is RETIRED); confirm unit economics ([[02-shopify-store]], [[00-north-star-and-pitch]]).
- [ ] Measure the dad's real manual nightly baseline for the 10x ([[07-metrics-and-proof]]).

**Week 2 — Storefront LIVE + first order signal** ([[02-shopify-store]], [[03-order-fulfilment-automation-n8n]])
- [ ] Brand the Shopify store + build the converting product page; go live and take a real test payment ([[02-shopify-store]]).
- [ ] Build `POST /api/orders/ingest` (Shopify adapter) → idempotent upsert into `orders` ([[03-order-fulfilment-automation-n8n]]).
- [ ] Stand up the dashboard shell on Vercel with auth + a read-only orders queue ([[04-ops-dashboard]]).

**Week 3 — Multi-channel order sync into ONE queue** ([[03-order-fulfilment-automation-n8n]], [[06-agents]])
- [ ] Wire eBay + Amazon order pulls → normalize → the same unified deduped queue ([[03-order-fulfilment-automation-n8n]]).
- [ ] Build the Order-Sync agent on APScheduler + `safety.py` (idempotent, rate-limit aware) ([[06-agents]]).
- [ ] Stand up the n8n Cloud orchestration skeleton calling the backend ([[03-order-fulfilment-automation-n8n]]).

**Week 4 — The 10x dispatch engine (the heart of the pitch)** ([[03-order-fulfilment-automation-n8n]], [[06-agents]])
- [ ] Auto pick/pack list for the brother ([[04-ops-dashboard]], [[03-order-fulfilment-automation-n8n]]).
- [ ] One-click Royal Mail Click & Drop label (CSV fallback ready) ([[03-order-fulfilment-automation-n8n]]).
- [ ] Auto-mark dispatched + push tracking back to the channel + notify the buyer ([[06-agents]]).
- [ ] Instrument stage timestamps for the time-saved metric; record the demo screen-capture ([[07-metrics-and-proof]], [[09-the-pitch-pack]]).

**Week 5 — First REAL sale, end-to-end** ([[05-content-and-ads-engine]], [[07-metrics-and-proof]])
- [ ] Publish the demo product for real sale; launch the organic content push with UTMs ([[05-content-and-ads-engine]]).
- [ ] Fulfil ≥1 real paid order end-to-end with live Royal Mail tracking; capture proof artefacts + real margin ([[07-metrics-and-proof]]).

**Week 6 — Harden, measure, turn on content/ads** ([[06-agents]], [[07-metrics-and-proof]])
- [ ] Harden the pipeline (retries, refunds/cancellations, out-of-stock); confirm `safety.py` caps ([[01-system-architecture]], [[06-agents]]).
- [ ] Ship Health/CEO + Analytics agents; finish the metrics + Time-Saved dashboard ([[06-agents]], [[04-ops-dashboard]]).
- [ ] Run the Higgsfield content pipeline; promote any organic winner to a credit-lean paid test ([[05-content-and-ads-engine]]).
- [ ] Full multi-channel regression; expand pytest on the money paths ([[10-claude-code-handoff]]).

**Week 7 — Pitch pack, dry-run, deliver (code freeze)** ([[09-the-pitch-pack]], [[07-metrics-and-proof]])
- [ ] Build the deck + deal one-pager (25% of net, defined; risk-reversal) ([[09-the-pitch-pack]]).
- [ ] Lock the proof reel from real numbers; full live dry-run with a recorded fallback ([[07-metrics-and-proof]]).
- [ ] Rehearse the pitch end-to-end at least once ([[09-the-pitch-pack]]).

## Start here (Claude Code)

> [!tip] The execution entry point is [[10-claude-code-handoff]]. Open an empty `fastener-ops/` directory with this vault in `docs/`, paste the first-session prompt from that note (§6), and build Phase A. Then walk the build order (§2) one PR per checkbox, each with its acceptance test green in CI. It links every sibling note for per-domain detail — read [[00-north-star-and-pitch]] and [[01-system-architecture]] first for the why and the shape.

## Consistency watch

Contradictions and gaps to keep an eye on as the build proceeds — none are blockers, but they need a single answer to stay consistent across notes:

- **Order status enum drifts between notes.** [[03-order-fulfilment-automation-n8n]] defines a granular flow (`new → ingested → ready_to_pack → packed → label_purchased → dispatched → tracking_synced → done` + `exception`), [[01-system-architecture]] uses `new → paid → packed → labelled → dispatched → delivered` (+ `on_hold/cancelled/refunded`), and [[04-ops-dashboard]] renders a five-status Kanban (`new/packed/labelled/dispatched/on_hold`). These must collapse to ONE canonical `orders.status` set (owned by [[03-order-fulfilment-automation-n8n]]) before schema freeze, with the dashboard mapping to it.
- **Schema table list isn't identical across notes.** [[01-system-architecture]] lists `spend_log`; [[06-agents]] adds `agent_runs`, `comms_log`, `assets`, `content_approvals`, `health_check`, `metrics_daily`; [[10-claude-code-handoff]]'s canonical `schema.sql` names `channel_connections`, `spend_log`, `run_logs`, `notifications`, `metrics_daily`. Reconcile into the single `schema.sql` — and pick ONE name for the run/audit table (`agent_runs` vs `run_logs`) and the channel table (`channels` vs `channel_connections`).
- **SKU prefix example mismatch.** [[02-shopify-store]] uses `LDF-…` (e.g. `LDF-DECK-200`); [[06-agents]] shows `BOLT-M6-50PK`. Harmless (both illustrative) but lock one convention so the cross-channel join key is unambiguous.
- **`safety.guarded` on Order-Sync is contested.** [[06-agents]] argues the deterministic order/label path must NOT be wrapped in `guarded` (the kill-switch could strand fulfilment), while [[10-claude-code-handoff]] task C4 wraps `order_sync` in `@safety.guarded("order_sync")`. Resolve to the [[06-agents]] rule (guard the *spend*, not the parcels) and make the ported `check_kill_switch` greenfield-aware so it never trips pre-revenue.
- **Higgsfield "preview tier" wording.** [[05-content-and-ads-engine]] explicitly corrects that there is no preview-tier flag (control cost via `get_cost` preflight + `count:1` + lean model), but [[06-agents]] and [[10-claude-code-handoff]] still say "preview tier". Treat [[05-content-and-ads-engine]] as authoritative and reword the others.
- **VAT stance is deliberately open.** [[02-shopify-store]] and [[09-the-pitch-pack]] both defer the dad's real VAT status — confirm it before go-live so the net-profit maths in [[07-metrics-and-proof]] uses the right gross-vs-net figures.
- **Funnel metrics are Shopify-only.** [[07-metrics-and-proof]] correctly flags that eBay/Amazon expose no session/CVR data — ensure the dashboard ([[04-ops-dashboard]]) labels the funnel scoreboard as owned-channel-only and never implies marketplace CVR.
