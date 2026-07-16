# Sales Log

One row per sale — this is where each real number is entered ONCE.

- `price_gbp` = what the buyer actually paid (after any Best Offer).
- `fees_inc_vat` = eBay fees including the 20% VAT on fees.
- `postage` = actual postage charged when known. Until Build 3 is live, £3.65 is an
  acceptable assumption — write `3.65 (assumed)`.
- `packaging` = £0.75 is an ESTIMATE until the real cost is confirmed.

**Fee model** (verified 16 Jul 2026 — eBay Business account, Business, Office & Industrial):
12.5% final value fee + £0.40/order (orders >£10) + 0.35% regulatory fee, all ex-VAT,
then +20% VAT on those fees.

**Quick contribution** ≈ 0.8458 × price − £17.99
(uses COGS £13.11 + postage £3.65 + packaging £0.75 est.)
Ready-made: **£37.99 → £14.14** · **£35.99 → £12.45**.

| date | sku | price_gbp | fees_inc_vat | postage | packaging | cogs | contribution | notes |
|---|---|---|---|---|---|---|---|---|

*(no sales logged yet)*
