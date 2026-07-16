# Unit economics — verified 16 Jul 2026

Source: Vorbix Claude Code briefing, 16 Jul 2026. Dylan: attach or link the raw
evidence to this file (Orbital Fasteners invoice, eBay fee page screenshot, Royal
Mail Apr 2026 price guide) so future-us can re-check.

## Verified inputs

| Item | Value | Source |
|---|---|---|
| COGS per kit | £13.11 | £91.76 ÷ 7 kits, Orbital Fasteners, delivered, inc VAT |
| eBay final value fee | 12.5% | eBay Business fees — Business, Office & Industrial category, ex-VAT |
| eBay per-order fee | £0.40 | orders over £10, ex-VAT |
| eBay regulatory fee | 0.35% | ex-VAT |
| VAT on eBay fees | +20% | not reclaimable — Dylan assumed NOT VAT-registered (confirm) |
| Postage | £3.65 | Royal Mail Tracked 48 Small Parcel (≤2kg AND ≤45×35×16cm), online rate, Apr 2026 guide. +£0.30 optional collection. |
| Packaging | £0.75 | ESTIMATE — unconfirmed |

## Contribution per kit (derived from the verified inputs)

contribution = price − 1.2 × (0.125·price + 0.0035·price + £0.40) − £3.65 − £0.75 − £13.11
≈ **0.8458 × price − £17.99**

| Sale price | Contribution |
|---|---|
| £37.99 | ≈ £14.14 |
| £35.99 | ≈ £12.45 → Best Offer auto-decline floor |
| £34.00 | ≈ £10.77 — FAILS the £12 rule (rule 4) |
| ≈ £21.27 | breakeven (derived) |

## Targets (derived)

| Goal (true monthly profit) | Kits/month |
|---|---|
| £500 | ~36 |
| £1,000 | ~71 |

If any input changes (real packaging cost, real postage from Build 3, VAT status),
update this file and `products/kit-001.md`, and re-derive the formula.
