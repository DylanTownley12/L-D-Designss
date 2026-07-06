import type { ZoneKey } from '../theme'

export type AnimKind =
  | 'radar' | 'stamp' | 'lift' | 'point' | 'type' | 'film' | 'calendar'
  | 'console' | 'lever' | 'greet' | 'pack' | 'headset' | 'coins' | 'shield' | 'server'

export interface AgentDef {
  id: number            // station number, 1..15 (0 = Hermes)
  code: string          // "01"
  name: string
  role: string
  zone: ZoneKey
  pos: [number, number, number]   // station centre on floor
  face: number          // Y rotation the robot faces (radians)
  anim: AnimKind
  statKeys: [string, string]      // which live stats the card shows
}

export interface Proposal {
  id: number
  product: string
  emoji: string
  estProfit: number     // £ per order
  budget: number        // £ ad budget
  createdAt: number
  status: 'pending' | 'approved' | 'rejected'
}

export interface FeedItem {
  id: number
  agent: string
  code: string
  text: string
  color: string
  time: number
}

export interface Kpis {
  revenue: number
  spend: number
  orders: number
  roas: number
  pl: number
  candidates: number
  kills: number
  passed: number
  approvals: number
  rejected: number
  shipped: number
}

// Transient visual events — components subscribe, sim emits.
export type SimEvent =
  | { type: 'kill'; at: number }
  | { type: 'pass'; at: number }
  | { type: 'proposal'; id: number }
  | { type: 'approve'; id: number }
  | { type: 'reject'; id: number }
  | { type: 'order'; id: number }
  | { type: 'ship'; id: number; revenue: number }
  | { type: 'coin'; amount: number }
  | { type: 'pulse'; station: number }
