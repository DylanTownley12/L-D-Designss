import type { AgentDef } from './types'
import type { Kpis } from './types'

// Conveyor lines (shared by scene + sim visuals)
export const INTAKE_Z = -7
export const INTAKE_START_X = -23
export const INTAKE_END_X = -1.5
export const SCANNER_X = -12.5

export const ORDER_Z = 8
export const ORDER_START_X = 3.5
export const ORDER_END_X = 20.5
export const GATE_X = 12.5
export const DOOR_X = 20.2

export const AGENTS: AgentDef[] = [
  // ── 1 · CYAN — RESEARCH INTAKE ─────────────────────────────
  { id: 1,  code: '01', name: 'SCOUT',     role: 'Product Research',   zone: 'cyan',    pos: [-18.5, 0, -11.5], face: 0.5,        anim: 'radar',    statKeys: ['Candidates found', 'Scan sweeps'] },
  { id: 2,  code: '02', name: 'KILLER',    role: 'Product Validation', zone: 'cyan',    pos: [-12.5, 0, -10.2], face: Math.PI,    anim: 'stamp',    statKeys: ['Killed', 'Kill rate'] },
  { id: 3,  code: '03', name: 'SUPPLIER',  role: 'Sourcing & Stock',   zone: 'cyan',    pos: [-6.5, 0, -11.5],  face: -0.6,       anim: 'lift',     statKeys: ['Passed to sourcing', 'Quotes open'] },
  { id: 4,  code: '04', name: 'PROFIT',    role: 'Margin Analysis',    zone: 'cyan',    pos: [-18, 0, -3.6],    face: -1.5708,    anim: 'point',    statKeys: ['Margins modelled', 'Avg margin'] },
  // ── 2 · MAGENTA — CREATIVE STUDIO ──────────────────────────
  { id: 5,  code: '05', name: 'CONTENT',   role: 'Copy & Hooks',       zone: 'magenta', pos: [6.5, 0, -11.5],   face: 2.6,        anim: 'type',     statKeys: ['Hooks written', 'Drafts queued'] },
  { id: 6,  code: '06', name: 'STUDIO',    role: 'Video Production',   zone: 'magenta', pos: [12, 0, -8.4],     face: Math.PI,    anim: 'film',     statKeys: ['Videos shot', 'Renders queued'] },
  { id: 7,  code: '07', name: 'POSTER',    role: 'Social Scheduling',  zone: 'magenta', pos: [17.5, 0, -11],    face: -2.6,       anim: 'calendar', statKeys: ['Posts scheduled', 'Slots today'] },
  { id: 8,  code: '08', name: 'ADS',       role: 'Campaign Launch',    zone: 'magenta', pos: [8, 0, -3.6],      face: 0,          anim: 'console',  statKeys: ['Campaigns live', 'Spend today'] },
  { id: 9,  code: '09', name: 'OPTIMISER', role: 'Scale / Kill Calls', zone: 'magenta', pos: [16, 0, -3.6],     face: 0,          anim: 'lever',    statKeys: ['Scaled', 'Killed'] },
  // ── 3 · AMBER — STORE & SHIP ───────────────────────────────
  { id: 10, code: '10', name: 'STORE',     role: 'Storefront',         zone: 'amber',   pos: [6.5, 0, 12.5],    face: Math.PI,    anim: 'greet',    statKeys: ['Visitors', 'Conversion'] },
  { id: 11, code: '11', name: 'PACKER',    role: 'Order Fulfilment',   zone: 'amber',   pos: [5, 0, 9.8],       face: Math.PI,    anim: 'pack',     statKeys: ['Orders packed', 'Awaiting gate'] },
  { id: 12, code: '12', name: 'SUPPORT',   role: 'Customer Care',      zone: 'amber',   pos: [12, 0, 12.5],     face: Math.PI,    anim: 'headset',  statKeys: ['Tickets solved', 'CSAT'] },
  // ── 4 · GREEN — OPS & FINANCE ──────────────────────────────
  { id: 13, code: '13', name: 'FINANCE',   role: 'P&L & Treasury',     zone: 'green',   pos: [-7, 0, 12],       face: Math.PI,    anim: 'coins',    statKeys: ['Revenue', 'P&L today'] },
  { id: 14, code: '14', name: 'COMPLIANCE',role: 'Policy & Risk',      zone: 'green',   pos: [-12.5, 0, 12.5],  face: Math.PI,    anim: 'shield',   statKeys: ['Checks passed', 'Flags'] },
  { id: 15, code: '15', name: 'DEV',       role: 'Infra & Tooling',    zone: 'green',   pos: [-18, 0, 9],       face: 1.5708,     anim: 'server',   statKeys: ['Uptime', 'Deploys'] },
]

export const HERMES = {
  id: 0, code: 'HQ', name: 'HERMES', role: 'Orchestrator — routes every task, owns the plan',
}

// Live per-agent stat lines derived from the KPI snapshot (keeps the store lean)
export function agentStats(id: number, k: Kpis): [string, string][] {
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) + '%' : '—')
  const gbp = (n: number) => '£' + n.toFixed(2)
  switch (id) {
    case 1: return [['Candidates found', String(k.candidates)], ['Verdicts issued', String(k.kills + k.passed)]]
    case 2: return [['Killed', String(k.kills)], ['Kill rate', pct(k.kills, k.kills + k.passed)]]
    case 3: return [['Passed to sourcing', String(k.passed)], ['Quotes open', String(Math.min(k.passed, 3))]]
    case 4: return [['Margins modelled', String(k.passed)], ['Est margin', k.passed ? '62%' : '—']]
    case 5: return [['Hooks written', String(k.passed * 3)], ['Drafts queued', String(k.passed % 4)]]
    case 6: return [['Videos rendered', String(k.passed * 2)], ['On turntable', k.passed ? '1' : '0']]
    case 7: return [['Posts scheduled', String(k.passed * 2)], ['Slots today', '6']]
    case 8: return [['Campaigns live', String(k.approvals)], ['Spend today', gbp(k.spend)]]
    case 9: return [['Scale calls', String(Math.max(0, k.approvals - 1))], ['Kill calls', String(k.rejected)]]
    case 10: return [['Store sessions', String(k.orders * 24)], ['Conversion', k.orders ? '3.1%' : '—']]
    case 11: return [['Orders packed', String(k.orders)], ['Shipped', String(k.shipped)]]
    case 12: return [['Tickets solved', String(Math.floor(k.shipped / 3))], ['CSAT', k.shipped ? '4.8★' : '—']]
    case 13: return [['Revenue', gbp(k.revenue)], ['P&L today', gbp(k.pl)]]
    case 14: return [['Checks passed', String(k.approvals + k.rejected)], ['Flags', '0']]
    case 15: return [['Uptime', '99.98%'], ['Deploys today', '3']]
    default: return [['Tasks routed', String(k.candidates + k.orders)], ['Agents online', '16/16']]
  }
}
