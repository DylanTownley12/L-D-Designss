# Vorbix OS

The single source of truth for Vorbix Supplies. Every real number lives here, entered
once. Humans read and write it in Obsidian; Claude Cowork reads it from GitHub and
writes reports into `research/`; Claude Code builds and maintains the tools around it.

## Map

| File / folder | What it holds |
|---|---|
| `00_dashboard.md` | Cash, stock, this week's experiment, open items |
| `rules.md` | The 7 operating rules — read before changing anything |
| `products/kit-001.md` | The screw kit: BOM, verified costs, price history |
| `data/sales.md` | One row per sale (the money truth) |
| `data/stock.md` | Units on hand + reorder triggers |
| `data/experiments.md` | One weekly experiment per listing |
| `finance/` | Monthly P&L files (`pnl-YYYY-MM.md`) |
| `sops/` | Written procedures — Dad's fastener knowledge goes here |
| `research/` | Verified source notes + Cowork's market reports |

## The one rule about numbers

Each real number is entered ONCE, here. If it isn't known, write `unknown` — never
guess (rule 6). Estimates are always labelled `(estimate)`.

## How to log a sale (anyone can do this, ~1 minute)

1. Open `data/sales.md`.
2. Add one row. Price = what the buyer actually paid (after any Best Offer).
3. Contribution at standard prices (kit cost, fees, postage and packaging already
   accounted for): **£37.99 → £14.14** · **£35.99 → £12.45**.
   Any other price: contribution ≈ 0.8458 × price − £17.99.
4. Knock one unit off `data/stock.md`.

## Obsidian setup (Dylan — one-time, ~10 minutes)

1. Install Obsidian from https://obsidian.md (free).
2. Get this repo onto the computer (easiest: GitHub Desktop → Clone repository →
   pick `vorbix-os`).
3. In Obsidian choose **"Open folder as vault"** and pick the `vorbix-os` folder.
4. Settings → Community plugins → **Turn off Restricted mode** → Browse → search
   **"Git"** (the obsidian-git plugin) → Install → Enable.
5. In the Git plugin settings: set the auto commit-and-sync interval to 10 minutes,
   and turn on "pull on startup" and push after commit.
6. Done. Edits made in Obsidian now save to GitHub automatically, and Cowork reads
   them from there.

Tip: sync (pull) before you start editing, and avoid two people editing the same
file at the same moment.
