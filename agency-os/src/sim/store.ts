import { create } from 'zustand'
import { ZONE, VIOLET, RED } from '../theme'
import type { FeedItem, Kpis, Proposal, SimEvent } from './types'

// ── Tiny event bus for transient visual events (stamps, drones, coins…) ──
type Listener = (e: SimEvent) => void
const listeners = new Set<Listener>()
export function onSimEvent(fn: Listener) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
export function emit(e: SimEvent) {
  listeners.forEach((fn) => fn(e))
}

// ── Product catalogue for the sim ──
const PRODUCTS: { name: string; emoji: string; price: number; profit: number }[] = [
  { name: 'Aurora Galaxy Projector', emoji: '🌌', price: 34.99, profit: 19.4 },
  { name: 'MagFold Phone Stand',     emoji: '📱', price: 19.99, profit: 11.2 },
  { name: 'HydraGlow Water Bottle',  emoji: '💧', price: 24.99, profit: 13.8 },
  { name: 'PawTrim Pet Groomer',     emoji: '🐾', price: 29.99, profit: 16.1 },
  { name: 'FlexBeam Neck Light',     emoji: '💡', price: 22.99, profit: 12.6 },
  { name: 'ZenMist Aroma Diffuser',  emoji: '🌿', price: 27.99, profit: 15.3 },
  { name: 'TurboKnead Massage Gun',  emoji: '⚡', price: 44.99, profit: 24.7 },
  { name: 'CloudStep Insoles',       emoji: '☁️', price: 17.99, profit: 10.4 },
]

const KILL_LINES = [
  'saturation 94% — no edge left', 'margin under 15% after shipping', 'supplier MOQ too high',
  '3.2★ reviews at scale — quality risk', 'ad CPMs already bid to death', 'seasonal peak already passed',
]
const SCOUT_LINES = [
  'new candidate from TikTok trend scan', 'candidate pulled from AliExpress movers',
  'candidate flagged by Google Trends spike', 'candidate from competitor spy sweep',
]

export interface AgencyState {
  mode: 'sim' | 'live'
  kpis: Kpis
  proposals: Proposal[]
  feed: FeedItem[]
  ordersPending: number          // approved orders waiting to enter the belt
  gateOpen: boolean
  selected: number | null        // station id for the info card (0 = Hermes)
  paused: boolean
  // actions
  select: (id: number | null) => void
  scan: () => 'kill' | 'pass'
  addProposal: () => void
  approve: (id: number) => void
  reject: (id: number) => void
  claimOrder: () => boolean
  ship: () => void
  tickSpend: () => void
  pushFeed: (code: string, agent: string, text: string, color: string) => void
  setLiveSnapshot: (s: Partial<Pick<AgencyState, 'kpis' | 'proposals' | 'feed'>>) => void
  setMode: (m: 'sim' | 'live') => void
}

const zeroKpis: Kpis = {
  revenue: 0, spend: 0, orders: 0, roas: 0, pl: 0,
  candidates: 0, kills: 0, passed: 0, approvals: 0, rejected: 0, shipped: 0,
}

let feedId = 0
let proposalId = 0
let productCursor = 0
// profit attribution: rolling avg of approved proposals' per-order profit & price
let activeProfit = 0
let activePrice = 0
let activeCount = 0

export const useAgency = create<AgencyState>((set, get) => ({
  mode: 'sim',
  kpis: { ...zeroKpis },
  proposals: [],
  feed: [],
  ordersPending: 0,
  gateOpen: false,
  selected: null,
  paused: false,

  select: (id) => set({ selected: id }),

  pushFeed: (code, agent, text, color) =>
    set((s) => ({
      feed: [{ id: feedId++, code, agent, text, color, time: Date.now() }, ...s.feed].slice(0, 42),
    })),

  scan: () => {
    const kill = Math.random() < 0.6
    const s = get()
    s.pushFeed('01', 'SCOUT', SCOUT_LINES[Math.floor(Math.random() * SCOUT_LINES.length)], ZONE.cyan)
    set((st) => ({
      kpis: {
        ...st.kpis,
        candidates: st.kpis.candidates + 1,
        kills: st.kpis.kills + (kill ? 1 : 0),
        passed: st.kpis.passed + (kill ? 0 : 1),
      },
    }))
    if (kill) {
      s.pushFeed('02', 'KILLER', 'KILLED — ' + KILL_LINES[Math.floor(Math.random() * KILL_LINES.length)], RED)
      emit({ type: 'kill', at: Date.now() })
    } else {
      s.pushFeed('02', 'KILLER', 'PASSED — margin + demand check clean', ZONE.green)
      s.pushFeed('03', 'SUPPLIER', 'sourcing quotes requested from 3 suppliers', ZONE.cyan)
      emit({ type: 'pass', at: Date.now() })
    }
    return kill ? 'kill' : 'pass'
  },

  addProposal: () => {
    const st = get()
    if (st.kpis.passed <= st.proposals.length) return   // proposals only for products that actually passed
    if (st.proposals.filter((p) => p.status === 'pending').length >= 3) return
    const prod = PRODUCTS[productCursor++ % PRODUCTS.length]
    const p: Proposal = {
      id: proposalId++,
      product: prod.name,
      emoji: prod.emoji,
      estProfit: prod.profit,
      budget: Math.round(15 + Math.random() * 25),
      createdAt: Date.now(),
      status: 'pending',
    }
    set((s) => ({ proposals: [...s.proposals, p] }))
    st.pushFeed('04', 'PROFIT', `proposal up: ${prod.name} — est £${prod.profit.toFixed(2)}/order`, ZONE.amber)
    st.pushFeed('HQ', 'HERMES', 'proposal routed to founder for approval', VIOLET)
    emit({ type: 'proposal', id: p.id })
  },

  approve: (id) => {
    const st = get()
    const p = st.proposals.find((x) => x.id === id)
    if (!p || p.status !== 'pending') return
    const price = PRODUCTS.find((x) => x.name === p.product)?.price ?? 29.99
    activeProfit = (activeProfit * activeCount + p.estProfit) / (activeCount + 1)
    activePrice = (activePrice * activeCount + price) / (activeCount + 1)
    activeCount++
    set((s) => ({
      proposals: s.proposals.map((x) => (x.id === id ? { ...x, status: 'approved' } : x)),
      ordersPending: s.ordersPending + 3 + Math.floor(Math.random() * 3),
      gateOpen: true,
      kpis: { ...s.kpis, approvals: s.kpis.approvals + 1 },
    }))
    st.pushFeed('HQ', 'HERMES', `APPROVED — ${p.product}. Gate open, ads live at £${p.budget}/day`, ZONE.green)
    st.pushFeed('08', 'ADS', `campaign launched: ${p.product}`, ZONE.magenta)
    emit({ type: 'approve', id })
  },

  reject: (id) => {
    const st = get()
    const p = st.proposals.find((x) => x.id === id)
    if (!p || p.status !== 'pending') return
    set((s) => ({
      proposals: s.proposals.map((x) => (x.id === id ? { ...x, status: 'rejected' } : x)),
      kpis: { ...s.kpis, rejected: s.kpis.rejected + 1 },
    }))
    st.pushFeed('HQ', 'HERMES', `REJECTED — ${p.product} logged and discarded`, RED)
    emit({ type: 'reject', id })
  },

  claimOrder: () => {
    const s = get()
    if (s.ordersPending <= 0) return false
    set((st) => ({ ordersPending: st.ordersPending - 1 }))
    set((st) => ({ kpis: { ...st.kpis, orders: st.kpis.orders + 1 } }))
    s.pushFeed('11', 'PACKER', 'order picked, packed and labelled', ZONE.amber)
    emit({ type: 'order', id: s.kpis.orders + 1 })
    return true
  },

  ship: () => {
    const s = get()
    const rev = activePrice || 29.99
    const profit = activeProfit || 15
    set((st) => {
      const revenue = st.kpis.revenue + rev
      const spend = st.kpis.spend
      return {
        kpis: {
          ...st.kpis,
          revenue,
          shipped: st.kpis.shipped + 1,
          pl: st.kpis.pl + profit,
          roas: spend > 0 ? revenue / spend : 0,
        },
      }
    })
    s.pushFeed('HQ', 'HERMES', `parcel airborne — £${rev.toFixed(2)} collected`, VIOLET)
    s.pushFeed('13', 'FINANCE', `revenue booked £${rev.toFixed(2)} · P&L updated`, ZONE.green)
    emit({ type: 'ship', id: s.kpis.shipped + 1, revenue: rev })
    emit({ type: 'coin', amount: rev })
  },

  tickSpend: () => {
    const s = get()
    if (s.kpis.approvals === 0) return
    const inc = 0.3 + Math.random() * 0.8
    set((st) => {
      const spend = st.kpis.spend + inc
      return {
        kpis: {
          ...st.kpis,
          spend,
          pl: st.kpis.pl - inc,
          roas: spend > 0 ? st.kpis.revenue / spend : 0,
        },
      }
    })
    if (Math.random() < 0.25)
      s.pushFeed('09', 'OPTIMISER', `ROAS ${get().kpis.roas.toFixed(2)} — holding budget steady`, ZONE.magenta)
  },

  setLiveSnapshot: (snap) => set(snap as Partial<AgencyState>),
  setMode: (m) => set({ mode: m }),
}))

// dev/debug handle — lets tooling drive the store (also handy for QA)
if (typeof window !== 'undefined') (window as any).agency = useAgency

// ── Sim engine — timers only; box-driven events come from the 3D belts ──
let engineStarted = false
export function startSimEngine() {
  if (engineStarted) return
  engineStarted = true
  const st = () => useAgency.getState()

  // proposals appear once products have genuinely passed validation
  setInterval(() => { if (st().mode === 'sim') st().addProposal() }, 9000)
  // ad spend burns while campaigns are live
  setInterval(() => { if (st().mode === 'sim') st().tickSpend() }, 4000)
  // approved campaigns keep generating orders while ads run
  setInterval(() => {
    const s = st()
    if (s.mode !== 'sim') return
    if (s.kpis.approvals > 0 && s.ordersPending < 6 && Math.random() < 0.75) {
      useAgency.setState((x) => ({ ordersPending: x.ordersPending + 1 }))
      s.pushFeed('10', 'STORE', 'checkout complete — new order in queue', ZONE.amber)
    }
  }, 5000)
  // ambient chatter from support/compliance/dev, tied to real state
  setInterval(() => {
    const s = st()
    if (s.mode !== 'sim') return
    const roll = Math.random()
    if (roll < 0.3 && s.kpis.shipped > 2) s.pushFeed('12', 'SUPPORT', 'ticket resolved — “where is my order” → tracking sent', ZONE.amber)
    else if (roll < 0.5) s.pushFeed('15', 'DEV', 'health check green — 16/16 agents responding', ZONE.green)
    else if (roll < 0.7 && s.kpis.approvals + s.kpis.rejected > 0) s.pushFeed('14', 'COMPLIANCE', 'ad creative policy scan passed', ZONE.green)
    else if (s.kpis.candidates > 0) s.pushFeed('HQ', 'HERMES', 'routing work — all lanes nominal', VIOLET)
  }, 7000)
}
