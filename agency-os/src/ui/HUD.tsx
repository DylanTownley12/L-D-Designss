import { CSSProperties, useEffect, useRef } from 'react'
import { useAgencyData } from '../sim/useAgencyData'
import { useAgency } from '../sim/store'
import { AGENTS, HERMES, agentStats } from '../sim/agents'
import { ZONE, VIOLET, RED } from '../theme'

const mono: CSSProperties = { fontVariantNumeric: 'tabular-nums', fontFamily: "'Segoe UI', system-ui, sans-serif" }
const panel: CSSProperties = {
  background: 'rgba(13,16,24,0.82)',
  border: '1px solid rgba(139,92,246,0.28)',
  borderRadius: 12,
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  pointerEvents: 'auto',
}

const gbp = (n: number) => '£' + n.toFixed(2)

function Kpi({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ padding: '8px 14px', minWidth: 92, textAlign: 'center' }}>
      <div style={{ fontSize: 10, letterSpacing: 1.6, color: '#8b93a8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{label}</div>
      <div style={{ ...mono, fontSize: 20, fontWeight: 800, color, textShadow: `0 0 14px ${color}55`, whiteSpace: 'nowrap' }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#6b7285', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

export function HUD() {
  const { mode, kpis, proposals, feed, approve, reject } = useAgencyData()
  const selected = useAgency((s) => s.selected)
  const select = useAgency((s) => s.select)
  const pending = proposals.filter((p) => p.status === 'pending')

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', color: '#e6e9f2', zIndex: 10 }}>
      {/* ── top bar ── */}
      <div style={{ position: 'absolute', top: 10, left: 12, right: 12, display: 'flex', gap: 10, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <div style={{ ...panel, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: VIOLET, boxShadow: `0 0 12px ${VIOLET}` }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 3 }}>AGENCY OS</div>
            <div style={{ fontSize: 9, letterSpacing: 1.4, color: '#8b93a8' }}>HERMES FULFILMENT FACTORY · 16 AGENTS</div>
          </div>
          <div style={{
            marginLeft: 8, fontSize: 9, fontWeight: 700, letterSpacing: 1.2, padding: '3px 8px', borderRadius: 6,
            background: mode === 'live' ? 'rgba(57,255,142,0.15)' : 'rgba(0,229,255,0.12)',
            border: `1px solid ${mode === 'live' ? ZONE.green : ZONE.cyan}44`,
            color: mode === 'live' ? ZONE.green : ZONE.cyan,
          }}>
            {mode === 'live' ? '● LIVE' : '● SIM'}
          </div>
        </div>
        <div style={{ ...panel, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <Kpi label="ROAS" value={kpis.spend > 0 ? kpis.roas.toFixed(2) + '×' : '—'} color={kpis.roas >= 2 ? ZONE.green : kpis.spend > 0 ? ZONE.amber : '#8b93a8'} sub={`spend ${gbp(kpis.spend)}`} />
          <Sep />
          <Kpi label="P&L Today" value={gbp(kpis.pl)} color={kpis.pl > 0 ? ZONE.green : kpis.pl < 0 ? RED : '#8b93a8'} sub={`revenue ${gbp(kpis.revenue)}`} />
          <Sep />
          <Kpi label="Orders" value={String(kpis.orders)} color={ZONE.amber} sub={`${kpis.shipped} shipped`} />
          <Sep />
          <Kpi label="Approvals" value={String(kpis.approvals)} color={VIOLET} sub={`${pending.length} waiting`} />
          <Sep />
          <Kpi label="Kill Rate" value={kpis.candidates ? Math.round((kpis.kills / Math.max(1, kpis.kills + kpis.passed)) * 100) + '%' : '—'} color={RED} sub={`${kpis.kills}/${kpis.candidates} killed`} />
        </div>
      </div>

      {/* ── approval panel ── */}
      <div style={{ position: 'absolute', right: 12, top: 92, width: 252, maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'auto' }}>
        {pending.length > 0 && (
          <div style={{ fontSize: 10, letterSpacing: 2, color: VIOLET, fontWeight: 800, textShadow: `0 0 10px ${VIOLET}88`, textAlign: 'right', paddingRight: 4 }}>
            ⬢ AWAITING YOUR APPROVAL
          </div>
        )}
        {pending.map((p) => (
          <div key={p.id} style={{ ...panel, border: `1px solid ${VIOLET}66`, padding: 12, animation: 'aospop .25s ease-out' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{p.emoji}</span>
              <div style={{ fontSize: 12, fontWeight: 800 }}>{p.product}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: '#9aa3b8', marginBottom: 10 }}>
              <div>Est profit <b style={{ color: ZONE.green, ...mono }}>{gbp(p.estProfit)}/order</b></div>
              <div>Budget <b style={{ color: ZONE.amber, ...mono }}>£{p.budget}/day</b></div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => approve(p.id)} style={btn(ZONE.green)}>APPROVE</button>
              <button onClick={() => reject(p.id)} style={btn(RED)}>REJECT</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── activity feed ── */}
      <div style={{ ...panel, position: 'absolute', left: 12, bottom: 12, width: 320, maxWidth: 'calc(100vw - 24px)', padding: '10px 12px' }}>
        <div style={{ fontSize: 10, letterSpacing: 2, color: '#8b93a8', marginBottom: 6, fontWeight: 700 }}>AGENT ACTIVITY</div>
        <div style={{ maxHeight: 148, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {feed.length === 0 && <div style={{ fontSize: 11, color: '#5c6478' }}>Factory booting — first candidates entering intake…</div>}
          {feed.slice(0, 8).map((f) => (
            <div key={f.id} style={{ display: 'flex', gap: 7, fontSize: 10.5, lineHeight: 1.45, animation: 'aosfeed .3s ease-out' }}>
              <span style={{ color: f.color, fontWeight: 800, ...mono, flexShrink: 0 }}>{f.code}</span>
              <span style={{ color: f.color, fontWeight: 700, flexShrink: 0 }}>{f.agent}</span>
              <span style={{ color: '#aeb5c8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── station card ── */}
      {selected !== null && <StationCard id={selected} onClose={() => select(null)} />}

      <style>{`
        @keyframes aospop { from { transform: scale(.92); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes aosfeed { from { transform: translateX(-8px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }
        button:active { transform: scale(.95) }
        ::-webkit-scrollbar { width: 4px } ::-webkit-scrollbar-thumb { background: rgba(139,92,246,.4); border-radius: 2px }
      `}</style>
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, alignSelf: 'stretch', margin: '8px 0', background: 'rgba(139,92,246,0.22)' }} />
}

function btn(color: string): CSSProperties {
  return {
    flex: 1, padding: '7px 0', fontSize: 11, fontWeight: 900, letterSpacing: 1.2,
    color: '#0c0f16', background: color, border: 'none', borderRadius: 7, cursor: 'pointer',
    boxShadow: `0 0 14px ${color}66`,
  }
}

function StationCard({ id, onClose }: { id: number; onClose: () => void }) {
  const kpis = useAgency((s) => s.kpis)
  const agent = id === 0 ? null : AGENTS.find((a) => a.id === id)
  const color = agent ? ZONE[agent.zone] : VIOLET
  const name = agent ? agent.name : HERMES.name
  const code = agent ? agent.code : 'HQ'
  const role = agent ? agent.role : HERMES.role
  const stats = agentStats(id, kpis)
  return (
    <div style={{
      ...panel, position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)',
      width: 300, maxWidth: 'calc(100vw - 40px)', padding: 14, border: `1px solid ${color}66`, animation: 'aospop .2s ease-out',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center',
          background: `${color}1e`, border: `1px solid ${color}55`, color, fontWeight: 900, ...mono, fontSize: 13,
        }}>{code}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: 1.5, color }}>{name}</div>
          <div style={{ fontSize: 10, color: '#8b93a8' }}>{role}</div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.18)', color: '#8b93a8',
          width: 24, height: 24, borderRadius: 6, cursor: 'pointer', fontSize: 12, lineHeight: 1,
        }}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '7px 10px' }}>
            <div style={{ fontSize: 9, color: '#7b8398', letterSpacing: 0.8, textTransform: 'uppercase' }}>{k}</div>
            <div style={{ ...mono, fontSize: 15, fontWeight: 800, color }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 9.5, color: '#67d18b', display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ZONE.green, boxShadow: `0 0 8px ${ZONE.green}` }} />
        ONLINE · working
      </div>
    </div>
  )
}
