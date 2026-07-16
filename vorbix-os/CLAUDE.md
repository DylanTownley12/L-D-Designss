# VORBIX SUPPLIES — CLAUDE CODE BRIEFING
*Paste this whole file into Claude Code as the opening prompt / CLAUDE.md for the Vorbix repo.*

## Who we are
Vorbix Supplies. Dylan, 18, UK sole trader, £300 starting capital. First product: ~364pc A2/304 stainless M3–M8 screw/nut/bolt/washer kit, 7 units, selling on eBay UK at £37.99 free postage. Girlfriend handles listings/packaging/creative; her dad is a fastener-industry veteran (supplier knowledge); Dylan handles suppliers, stock, pricing, spend. Goal: £500–£1,000 true monthly profit; stretch £10k/month by age 20.

## The system you are part of
- **Vorbix OS** = single source of truth: an **Obsidian vault of markdown files, synced to a GitHub repo** (obsidian-git). Profit, stock, orders, experiments, SOPs all live here as .md files. You build and maintain this repo.
- **Claude Cowork** = cloud analyst. Clones/reads this repo, runs scheduled reports (daily brief 07:00, weekly listing review Mon 08:00, monthly P&L), writes recommendations back. It cannot access eBay or Royal Mail — that's what you build.
- **Codex** = reviews your code and any big money decision before it ships.
- **Humans approve** all spending, pricing changes, publishing, and customer/supplier messages. No exceptions.
- No two systems duplicate a job. Each real number is entered ONCE, in the repo.

## Verified economics (16 Jul 2026 — sources in repo /research)
- COGS £13.11/kit (£91.76 ÷ 7, Orbital Fasteners delivered inc VAT)
- eBay business fees (Business, Office & Industrial): 12.5% FVF + £0.40/order (>£10) + 0.35% regulatory, all ex-VAT → +20% VAT on fees (not reclaimable; Dylan not VAT-registered — confirm)
- Royal Mail Tracked 48 Small Parcel (≤2kg AND ≤45×35×16cm): £3.65 online rate (Apr 2026 guide); +£0.30 optional collection
- Contribution: £37.99 sale ≈ £14.14 · £35.99 ≈ £12.45 · £34.00 ≈ £10.77 (fails £12 rule)
- Best Offer auto-decline floor: £35.99
- Targets: ~36 kits/mo = £500; ~71 kits/mo = £1,000 at current contribution
- Packaging cost estimated £0.75 — UNCONFIRMED. Kit packed weight/dims — UNCONFIRMED.

## Operating rules (hard-code these into anything you build)
1. High impressions + poor CTR → recommend changing main image OR title (one).
2. 50+ views, no sale → review offer/presentation/price.
3. ONE experimental variable per listing per week.
4. 4 of 7 units sold within 21 days at £12+ true profit → recommend reorder.
5. Weak products improved or killed, never blindly restocked.
6. NEVER invent data. Missing = "unknown". Estimates always labelled. Simulated ≠ real.
7. Recommendations only — no autonomous spending/publishing/messaging.

## BUILD ORDER (do not reorder without Dylan's sign-off)

### Build 1 — Vorbix OS repo scaffold (now)
Obsidian-friendly markdown repo:
```
vorbix-os/
  00_dashboard.md          # current cash, stock, this week's experiment
  products/kit-001.md      # BOM, verified specs, listing copy, price history
  data/sales.md            # one row per sale: date, sku, price, fees, postage, contribution
  data/stock.md            # units on hand, reorder triggers
  data/experiments.md      # one row per weekly experiment: variable, hypothesis, result
  finance/pnl-YYYY-MM.md   # monthly P&L
  sops/                    # dad's knowledge → procedures
  research/                # Cowork's market reports land here
  rules.md                 # the 7 rules above, verbatim
```
Keep tables simple markdown so Cowork (cloud) and humans (Obsidian) both read/write cleanly. Add obsidian-git sync instructions for Dylan.

### Build 2 — eBay MCP server (the big one)
eBay Sell APIs (Dylan registers at developer.ebay.com — free): OAuth, then read-only first: listing metrics (impressions/views via Analytics API), orders (Fulfillment API), active listings (Inventory/ Browse). Expose as MCP tools: `get_listing_metrics`, `get_orders`, `get_active_listings`. Use Anthropic's mcp-builder patterns (FastMCP Python or TS SDK). NO write endpoints in v1 — read-only by design so Cowork can never touch live listings. Codex security review before Dylan adds credentials. Output: connectable custom MCP for Cowork + CLI for local use.

### Build 3 — Royal Mail Click & Drop integration
C&D API: pull actual postage charged per order into data/sales.md so contribution uses real postage, not the £3.65 assumption. Read-only v1. Label creation stays manual/human-approved.

### Build 4 — data-in helper (only if manual entry becomes the bottleneck)
Tiny script/form: girlfriend or Dylan logs a sale once → appends to data/sales.md with fees auto-calculated from the verified fee model above.

## Definition of done, every build
Codex has reviewed it; secrets in env vars never committed; read-only until Dylan explicitly approves writes; Cowork can consume the output without hand-holding; and a one-page README a non-developer (the girlfriend) can follow.

## Open items Dylan still owes the system
Exact BOM/piece count · head & drive type · supplier A2/304 evidence · packed weight · parcel dimensions · real packaging cost · confirmed eBay category ID · VAT registration status (assumed no).
