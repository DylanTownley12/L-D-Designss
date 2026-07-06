# AGENCY OS — Hermes Fulfilment Factory

A live 3D dashboard visualising a 16-agent AI dropshipping system as a robot-run
fulfilment factory. Vite + React + TypeScript + React Three Fiber + drei +
postprocessing + zustand.

```bash
npm install
npm run dev     # http://localhost:5173
```

## The world

- **Centre** — violet glass HERMES tower (agent 16, the orchestrator). Pulsing core,
  light trails arc to every station with travelling pulses.
- **District 1 · CYAN — Research Intake**: 01 Scout (radar) · 02 Killer (scanner arch,
  ~60% of candidate crates get stamped KILLED and drop down the reject chute) ·
  03 Supplier (crate dock) · 04 Profit (margin board)
- **District 2 · MAGENTA — Creative Studio**: 05 Content (desk) · 06 Studio (video
  turntable + camera rig) · 07 Poster (calendar wall) · 08 Ads (launch console) ·
  09 Optimiser (SCALE/KILL lever)
- **District 3 · AMBER — Store & Ship**: 10 Store (shop window) · 11 Packer (packing
  line) · 12 Support (help desk). Order parcels ride the belt through the
  **APPROVAL GATE** to the shipping door, where drones lift them away.
- **District 4 · GREEN — Ops & Finance**: 13 Finance (coin stacks grow with every
  sale + vault) · 14 Compliance (shield scanner) · 15 Dev (blinking server racks)

Tap any station (or the tower) for the agent's card with live stats.

## Honest zeros

Every KPI starts at 0 and only moves on simulation events. Nothing ships without
approval: proposals appear in the right-hand panel (product, est profit/order,
budget) — APPROVE opens the gate and starts orders, REJECT logs and discards.

## Data adapter — sim vs live

All data flows through one hook: `src/sim/useAgencyData.ts`. The UI has no idea
which mode feeds it.

- **sim** (default) — in-memory simulation drives everything.
- **live** — add `?mode=live` to the URL (or set `VITE_DATA_MODE=live`). The app
  polls `./status/*.json` every 3s:
  - `status/kpis.json` — the `Kpis` object (see `src/sim/types.ts`)
  - `status/proposals.json` — `Proposal[]`
  - `status/feed.json` — `FeedItem[]`

  Point your real agent system at those three files and the factory renders it.

## Performance

Pixel ratio capped at 2, instanced coins, shared geometries/materials for robots
and crates, one shadow-casting light, local-scene environment map (no network),
bloom + vignette only.
