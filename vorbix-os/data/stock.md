# Stock

| sku | name | units_on_hand | unit_cost | supplier | reorder_trigger | last_updated |
|---|---|---|---|---|---|---|
| kit-001 | ~364pc A2/304 M3–M8 fastener kit | 7 | £13.11 | Orbital Fasteners | rule 4: 4 of 7 sold within 21 days at £12+ true profit → recommend reorder | 2026-07-16 |

Update `units_on_hand` every time a sale is logged in `data/sales.md`.

A reorder trigger firing produces a **recommendation only** — Dylan approves all
spending (rule 7). Weak products get improved or killed, never blindly restocked
(rule 5).
