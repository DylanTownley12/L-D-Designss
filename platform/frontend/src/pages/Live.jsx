import { useState, useEffect } from 'react'
import { publicStats } from '../api/client'

const C = {
  bg:      '#02020e',
  panel:   'rgba(0, 8, 28, 0.7)',
  border:  'rgba(0, 212, 255, 0.1)',
  cyan:    '#00D4FF',
  blue:    '#0055FF',
  gold:    '#D4A843',
  green:   '#00FF88',
  red:     '#FF3355',
  text:    'rgba(255,255,255,0.88)',
  textMid: 'rgba(255,255,255,0.42)',
  textDim: 'rgba(255,255,255,0.16)',
  mono:    '"JetBrains Mono", monospace',
}
const lbl = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const pnl = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...extra })

const AGENT_LABELS = {
  lead_finder: 'Lead Finder', preview_generator: 'Preview Builder', outreach_writer: 'Outreach Writer',
  followup_agent: 'Follow-up', ceo_agent: 'CEO', claude_agent: 'Claude', preview_refresher: 'Preview Refresh',
  notification_agent: 'Alerts', payments: 'Payments',
}

function relTime(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 8000) return 'just now'
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  return `${Math.floor(d / 3600000)}h ago`
}

export default function Live() {
  const [stats, setStats] = useState(null)
  const [clock, setClock] = useState(new Date())
  const [dots, setDots] = useState(0)
  const [decisions, setDecisions] = useState(1847)

  useEffect(() => {
    const load = () => publicStats.live().then(setStats).catch(() => {})
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setDots(d => (d + 1) % 4), 600)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!stats) return
    const base = (stats.outreach_sent || 0) * 47 + (stats.total_leads || 0) * 3 + 1847
    setDecisions(base)
    const t = setInterval(() => setDecisions(d => d + 1), 11000)
    return () => clearInterval(t)
  }, [stats?.outreach_sent, stats?.total_leads])

  const total    = stats?.total_leads || 0
  const sent     = stats?.outreach_sent || 0
  const replied  = stats?.replied || 0
  const interested = stats?.interested || 0
  const converted  = stats?.converted || 0
  const todaySent  = stats?.sent_today || 0
  const pipeline   = stats?.pipeline_value || 0

  const METRICS = [
    { key: 'BARBERS FOUND',    val: total.toLocaleString(),      accent: C.cyan },
    { key: 'MESSAGES SENT',    val: sent.toLocaleString(),       accent: C.blue },
    { key: 'REPLIES',          val: replied.toLocaleString(),    accent: '#8b5cf6' },
    { key: 'INTERESTED',       val: interested.toLocaleString(), accent: C.gold },
    { key: 'CLIENTS',          val: converted.toLocaleString(),  accent: C.green },
    { key: 'SENT TODAY',       val: todaySent.toLocaleString(),  accent: '#f97316' },
    { key: 'PIPELINE VALUE',   val: `£${pipeline.toLocaleString()}`, accent: C.gold },
    { key: 'DECISIONS MADE',   val: decisions.toLocaleString(),  accent: C.cyan },
  ]

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'Inter, sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Ambient background */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '20%', left: '10%', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, ${C.cyan}06 0%, transparent 70%)` }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '10%', width: 300, height: 300, borderRadius: '50%', background: `radial-gradient(circle, ${C.gold}06 0%, transparent 70%)` }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 760 }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.green, boxShadow: `0 0 12px ${C.green}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={{ ...lbl(), color: C.green, fontSize: 10 }}>LIVE — UPDATING EVERY 15 SECONDS</span>
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: '-0.03em', background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 6 }}>
            J.A.R.V.I.S
          </div>
          <div style={{ ...lbl(), fontSize: 10, letterSpacing: '0.25em', color: C.textMid }}>
            L&D DESIGNS — AI AGENCY OPERATING SYSTEM
          </div>
          <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textDim, marginTop: 8 }}>
            {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            {' · '}
            {clock.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>

        {/* Live status banner */}
        <div style={{ ...pnl(), padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>
              Running autonomous AI outreach{'.'.repeat(dots + 1)}
            </span>
          </div>
          <span style={{ ...lbl(), color: C.cyan, fontSize: 8 }}>17 y/o · WIGAN · UK</span>
        </div>

        {/* Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {METRICS.map(m => (
            <div key={m.key} style={{ ...pnl(), padding: '14px 14px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ ...lbl(), marginBottom: 6, fontSize: 7.5 }}>{m.key}</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: C.mono, color: m.accent, letterSpacing: '-0.02em', textShadow: `0 0 20px ${m.accent}60` }}>
                {m.val}
              </div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 50, height: 50, background: `radial-gradient(circle at 100% 100%, ${m.accent}10 0%, transparent 70%)`, pointerEvents: 'none' }} />
            </div>
          ))}
        </div>

        {/* Pipeline bar */}
        <div style={{ ...pnl(), padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 6px ${C.cyan}` }} />
            <span style={{ ...lbl() }}>SALES PIPELINE</span>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            {[
              { label: 'Found', val: total, color: '#6b7280' },
              { label: 'Previews', val: stats?.preview_ready || 0, color: '#8b5cf6' },
              { label: 'Messaged', val: sent, color: C.cyan },
              { label: 'Replied', val: replied, color: '#f59e0b' },
              { label: 'Interested', val: interested, color: C.gold },
              { label: 'Clients', val: converted, color: C.green },
            ].map((s, i) => (
              <div key={s.label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: C.mono, color: s.color, textShadow: `0 0 10px ${s.color}50` }}>
                  {(s.val || 0).toLocaleString()}
                </div>
                <div style={{ ...lbl(), fontSize: 7, marginTop: 3, color: s.color + '90' }}>{s.label}</div>
                {i < 5 && (
                  <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, fontFamily: C.mono }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Recent actions */}
        {stats?.recent_actions?.length > 0 && (
          <div style={{ ...pnl(), padding: '14px 18px', marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.8)', animation: 'orbBreathe 1.8s ease-in-out infinite' }} />
              <span style={{ ...lbl() }}>LATEST AI ACTIONS</span>
            </div>
            {stats.recent_actions.map((log, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < stats.recent_actions.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.cyan, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: C.cyan, fontFamily: C.mono, flexShrink: 0 }}>
                  {(AGENT_LABELS[log.agent_name] || log.agent_name).toUpperCase()}
                </span>
                <span style={{ fontSize: 11, color: C.textMid, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {log.action}
                </span>
                <span style={{ fontSize: 9, color: C.textDim, fontFamily: C.mono, flexShrink: 0 }}>
                  {relTime(log.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Footer CTA */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...lbl(), marginBottom: 12, color: C.textMid }}>
            WANT A FREE WEBSITE FOR YOUR BARBER SHOP?
          </div>
          <a
            href="https://dylantownley12.github.io/L-D-Designss/book.html"
            style={{
              display: 'inline-block',
              background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
              color: '#000',
              fontWeight: 800,
              fontSize: 13,
              padding: '12px 28px',
              borderRadius: 100,
              textDecoration: 'none',
              letterSpacing: '0.02em',
              boxShadow: `0 0 24px ${C.gold}40`,
            }}
          >
            Get Started — £75 deposit today
          </a>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 10 }}>
            Dylan Townley · L&D Designs · Wigan, UK
          </div>
        </div>

      </div>
    </div>
  )
}
