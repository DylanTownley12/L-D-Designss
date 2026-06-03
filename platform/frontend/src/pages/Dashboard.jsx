import { useState, useEffect, useRef } from 'react'
import { dashboard as dashApi, agents as agentsApi } from '../api/client'
import { RefreshCcw, AlertCircle } from 'lucide-react'

const AGENTS = {
  ceo_agent:         { label: 'CEO',          color: '#D4A843' },
  research_agent:    { label: 'Research',     color: '#14b8a6' },
  cmo_agent:         { label: 'CMO',          color: '#f97316' },
  sales_agent:       { label: 'Sales',        color: '#22c55e' },
  dev_agent:         { label: 'Dev',          color: '#94a3b8' },
  analyst_agent:     { label: 'Analyst',      color: '#a855f7' },
  orchestrator:      { label: 'Orchestrator', color: '#D4A843' },
  lead_finder:       { label: 'Lead Finder',  color: '#3b82f6' },
  website_analyzer:  { label: 'Analyzer',     color: '#8b5cf6' },
  preview_generator: { label: 'Preview Gen',  color: '#06b6d4' },
  lead_enricher:     { label: 'Enricher',     color: '#ec4899' },
  outreach_writer:   { label: 'Outreach',     color: '#10b981' },
  followup_agent:    { label: 'Follow-up',    color: '#f59e0b' },
}

const CRON_OPS = [
  { min: 360, label: 'Enrich Leads' },
  { min: 390, label: 'Instagram DMs' },
  { min: 420, label: 'Fill WA Queue' },
  { min: 480, label: 'Daily Briefing' },
  { min: 540, label: 'Send Outreach' },
  { min: 600, label: 'Generate Emails' },
  { min: 660, label: 'Send Follow-ups' },
  { min: 720, label: 'Send Emails' },
]

function nextOp() {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const next = CRON_OPS.find(o => o.min > mins)
  if (!next) {
    const diff = (24 * 60 - mins) + 360
    const h = Math.floor(diff / 60), m = diff % 60
    return { label: '06:00', op: 'Enrich Leads', countdown: `${h}h ${m}m` }
  }
  const diff = next.min - mins
  const h = Math.floor(diff / 60), m = diff % 60
  const label = `${String(Math.floor(next.min / 60)).padStart(2, '0')}:${String(next.min % 60).padStart(2, '0')}`
  return { label, op: next.label, countdown: h > 0 ? `${h}h ${m}m` : `${m}m` }
}

const MAX_RETRIES = 4
const RETRY_DELAY = 8000

async function fetchWithRetry(fn, attempt = 0) {
  try { return await fn() }
  catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY))
      return fetchWithRetry(fn, attempt + 1)
    }
    throw err
  }
}

function relTime(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 8000) return 'just now'
  if (d < 60000) return `${Math.floor(d / 1000)}s`
  if (d < 3600000) return `${Math.floor(d / 60000)}m`
  return `${Math.floor(d / 3600000)}h`
}

function agentStatus(key, logs) {
  const log = logs.find(l => l.agent_name === key)
  if (!log) return 'idle'
  const age = Date.now() - new Date(log.created_at).getTime()
  if (log.status === 'error') return 'error'
  if (age < 5 * 60 * 1000) return 'active'
  if (age < 60 * 60 * 1000) return 'recent'
  return 'idle'
}

/* ── Live Operations Feed ── */
function OperationsFeed({ logs }) {
  const latest = logs[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Section label */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.8)',
            animation: 'orbBreathe 1.8s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.3)', fontFamily: '"JetBrains Mono", monospace',
          }}>LIVE OPERATIONS</span>
        </div>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.1)', fontFamily: '"JetBrains Mono", monospace' }}>
          {logs.length} events
        </span>
      </div>

      {/* Latest event — pinned hero */}
      {latest && (() => {
        const meta = AGENTS[latest.agent_name] || { label: latest.agent_name, color: '#6b7280' }
        const isErr = latest.status === 'error'
        const c = isErr ? '#ef4444' : meta.color
        return (
          <div style={{
            padding: '11px 14px', marginBottom: 12, flexShrink: 0,
            background: `linear-gradient(135deg, ${c}12 0%, rgba(255,255,255,0.02) 100%)`,
            border: `1px solid ${c}30`, borderRadius: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: c, boxShadow: `0 0 6px ${c}`,
                animation: 'orbBreathe 1.5s ease-in-out infinite',
              }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: c, fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.08em' }}>
                {meta.label.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace', marginLeft: 'auto' }}>
                {relTime(latest.created_at)} ago
              </span>
            </div>
            <div style={{ fontSize: 13.5, color: isErr ? '#f87171' : 'rgba(255,255,255,0.82)', lineHeight: 1.4, paddingLeft: 13 }}>
              {latest.action}
            </div>
          </div>
        )
      })()}

      {/* Log stream */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {logs.length === 0 ? (
          <div style={{
            paddingTop: 60, textAlign: 'center',
            color: 'rgba(255,255,255,0.08)', fontSize: 11,
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.12em',
          }}>
            AWAITING AGENT ACTIVITY
          </div>
        ) : logs.slice(1).map((log) => {
          const meta = AGENTS[log.agent_name] || { label: log.agent_name, color: '#6b7280' }
          const isNew = log.isNew
          const isErr = log.status === 'error'
          const isRecent = Date.now() - new Date(log.created_at).getTime() < 5 * 60 * 1000

          return (
            <div
              key={log.id}
              className={isNew ? 'feed-entry' : ''}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '7px 0',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                background: isNew ? `${meta.color}07` : 'transparent',
                transition: 'background 1s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingTop: 2 }}>
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: isErr ? '#ef4444' : isRecent ? meta.color : 'rgba(255,255,255,0.07)',
                  flexShrink: 0,
                }} />
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                  color: isErr ? '#ef4444' : meta.color + (isRecent ? '' : '60'),
                  fontFamily: '"JetBrains Mono", monospace',
                  width: 74, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {meta.label.toUpperCase()}
                </span>
              </div>
              <span style={{
                flex: 1, fontSize: 12,
                color: isErr ? '#f87171' : isRecent ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.28)',
                lineHeight: 1.4,
              }}>
                {log.action}
              </span>
              <span style={{
                fontSize: 9.5, color: 'rgba(255,255,255,0.11)',
                fontFamily: '"JetBrains Mono", monospace', flexShrink: 0, paddingTop: 2,
              }}>
                {relTime(log.created_at)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Mission Status Column ── */
function MissionStatus({ stats, logs }) {
  if (!stats) return null

  const lastSent = stats.last_whatsapp_sent_at
  const minsAgo = lastSent ? Math.floor((Date.now() - new Date(lastSent)) / 60000) : null
  const bazLive = minsAgo !== null && minsAgo < 20 * 60

  const total = stats.total_leads || 0
  const previews = stats.preview_ready || 0
  const contacted = stats.outreach_sent || 0
  const replies = stats.replies || 0
  const converted = stats.converted || 0

  const pipeline = [
    { label: 'DISCOVERED', value: total,     color: '#3b82f6', pct: Math.min(100, (total / 1200) * 100) },
    { label: 'SITES BUILT', value: previews, color: '#06b6d4', pct: total > 0 ? (previews / total) * 100 : 0 },
    { label: 'CONTACTED',  value: contacted, color: '#10b981', pct: previews > 0 ? (contacted / previews) * 100 : 0 },
    { label: 'REPLIED',    value: replies,   color: '#D4A843', pct: contacted > 0 ? (replies / contacted) * 100 : 0 },
    { label: 'CONVERTED',  value: converted, color: '#22c55e', pct: replies > 0 ? (converted / replies) * 100 : 0 },
  ]

  const panelStyle = {
    background: 'rgba(255,255,255,0.018)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12, padding: '14px 16px',
  }

  const sectionLabel = {
    fontSize: 8.5, fontWeight: 700, letterSpacing: '0.22em',
    color: 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace',
    textTransform: 'uppercase', marginBottom: 12,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflowY: 'auto' }}>

      {/* Pipeline */}
      <div style={panelStyle}>
        <div style={sectionLabel}>PIPELINE</div>
        {pipeline.map(({ label, value, color, pct }) => (
          <div key={label} style={{ marginBottom: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.22)', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>
                {label}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: value > 0 ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.14)', fontFamily: '"JetBrains Mono", monospace' }}>
                {value.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pct}%`, background: color, borderRadius: 99,
                transition: 'width 0.8s ease',
                boxShadow: value > 0 ? `0 0 4px ${color}60` : 'none',
              }} />
            </div>
          </div>
        ))}
        {converted > 0 && (
          <div style={{
            marginTop: 10, padding: '8px 10px',
            background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)',
            borderRadius: 8, fontSize: 11, color: '#4ade80',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            £{converted * 15}/mo · £{converted * 150} in builds
          </div>
        )}
      </div>

      {/* Baz */}
      <div style={{
        background: bazLive ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
        border: `1px solid ${bazLive ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)'}`,
        borderRadius: 12, padding: '12px 16px',
      }}>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>BAZ — WHATSAPP AI</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: bazLive ? '#10b981' : '#ef4444',
            boxShadow: bazLive ? '0 0 8px rgba(16,185,129,0.7)' : '0 0 6px rgba(239,68,68,0.4)',
            animation: bazLive ? 'orbBreathe 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: bazLive ? '#34d399' : '#f87171' }}>
            {bazLive ? 'Responding autonomously' : 'Needs attention'}
          </span>
        </div>
        {bazLive && minsAgo !== null && (
          <div style={{ marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.22)', fontFamily: '"JetBrains Mono", monospace' }}>
            Last message: {minsAgo === 0 ? 'just now' : `${minsAgo}m ago`}
          </div>
        )}
        {!bazLive && (
          <div style={{ marginTop: 6, fontSize: 9.5, color: 'rgba(239,68,68,0.45)', fontFamily: '"JetBrains Mono", monospace', lineHeight: 1.6 }}>
            openclaw channels login --channel whatsapp
          </div>
        )}
      </div>

      {/* Personnel heartbeat */}
      <div style={{ ...panelStyle, flex: 1 }}>
        <div style={sectionLabel}>PERSONNEL</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(AGENTS).map(([key, meta]) => {
            const status = agentStatus(key, logs)
            const isActive = status === 'active'
            const isError = status === 'error'
            const isRecent = status === 'recent'
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                  background: isActive ? meta.color : isError ? '#ef4444' : isRecent ? meta.color + '50' : 'rgba(255,255,255,0.09)',
                  boxShadow: isActive ? `0 0 6px ${meta.color}` : 'none',
                  animation: isActive ? 'orbBreathe 1.8s ease-in-out infinite' : 'none',
                }} />
                <span style={{
                  flex: 1, fontSize: 11.5,
                  color: isActive ? 'rgba(255,255,255,0.85)' : isRecent ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.18)',
                }}>
                  {meta.label}
                </span>
                {isActive && (
                  <span style={{
                    fontSize: 8.5, fontWeight: 700, color: meta.color,
                    fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.06em',
                    background: meta.color + '18', padding: '1px 5px', borderRadius: 3,
                  }}>ON</span>
                )}
                {isError && (
                  <span style={{
                    fontSize: 8.5, fontWeight: 700, color: '#ef4444',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}>ERR</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Main ── */
export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking] = useState(false)
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])
  const [tick, setTick] = useState(0)
  const prevIds = useRef(new Set())

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    const t = setTimeout(() => setWaking(true), 5000)
    try {
      const data = await fetchWithRetry(() => dashApi.stats())
      setStats(data)
    } catch (e) {
      setError(e.message)
    } finally {
      clearTimeout(t)
      setWaking(false)
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await agentsApi.logs(null, 60)
        const entries = data.logs || []
        const ids = new Set(entries.map(l => l.id))
        setLogs(entries.map(l => ({ ...l, isNew: !prevIds.current.has(l.id) })))
        prevIds.current = ids
      } catch {}
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 60000)
    return () => clearInterval(t)
  }, [])

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 22 }}>
      <svg width="80" height="80" viewBox="-40 -40 80 80" style={{ overflow: 'visible' }}>
        <circle cx="0" cy="0" r="36" fill="none" stroke="rgba(212,168,67,0.06)" strokeWidth="1" />
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 7s linear infinite' }}>
          <circle cx="0" cy="0" r="36" fill="none" stroke="rgba(212,168,67,0.25)" strokeWidth="0.8" strokeDasharray="4 14" />
          <circle cx="0" cy="-36" r="3" fill="#D4A843" />
        </g>
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 4.5s linear infinite reverse' }}>
          <circle cx="0" cy="0" r="22" fill="none" stroke="rgba(6,182,212,0.2)" strokeWidth="0.5" />
          <circle cx="0" cy="-22" r="2" fill="#06b6d4" />
        </g>
        <circle cx="0" cy="0" r="9" fill="rgba(212,168,67,0.08)" stroke="rgba(212,168,67,0.25)" strokeWidth="0.5" style={{ animation: 'orbBreathe 2s ease-in-out infinite' }} />
        <circle cx="0" cy="0" r="2.5" fill="#D4A843" style={{ animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
      </svg>
      <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.16em' }}>
        {waking ? 'WAKING BACKEND...' : 'BOOTING AI OPERATING SYSTEM...'}
      </div>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 14 }}>
      <AlertCircle size={22} color="#ef4444" />
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: '"JetBrains Mono", monospace' }}>
        CONNECTION FAILED: {error}
      </div>
      <button
        onClick={load}
        style={{
          background: 'none', border: '1px solid rgba(212,168,67,0.3)',
          color: '#D4A843', fontSize: 11, fontFamily: '"JetBrains Mono", monospace',
          padding: '6px 18px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.1em',
        }}
      >
        RETRY
      </button>
    </div>
  )

  const activeCount = Object.entries(AGENTS).filter(([k]) => agentStatus(k, logs) === 'active').length
  const next = nextOp()

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      padding: '14px 20px', gap: 14, boxSizing: 'border-box',
    }}>

      {/* ── COMMAND BAR ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, paddingBottom: 13,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <span style={{
            fontSize: 13, fontWeight: 800, letterSpacing: '0.08em',
            color: '#D4A843', fontFamily: '"JetBrains Mono", monospace',
          }}>
            L&D.OS
          </span>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            {[
              { key: 'EMPLOYEES', val: `${Object.keys(AGENTS).length}` },
              { key: 'ACTIVE', val: activeCount > 0 ? `${activeCount}` : '—', accent: activeCount > 0 ? '#10b981' : undefined },
              { key: 'NEXT OP', val: next.label },
              { key: 'IN', val: next.countdown },
            ].map(item => (
              <div key={item.key} style={{ display: 'flex', gap: 5, alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.18)',
                  fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.14em',
                }}>
                  {item.key}
                </span>
                <span style={{
                  fontSize: 12.5, fontWeight: 700,
                  color: item.accent || 'rgba(255,255,255,0.62)',
                  fontFamily: '"JetBrains Mono", monospace',
                }}>
                  {item.val}
                </span>
              </div>
            ))}
            <span style={{
              fontSize: 10, color: 'rgba(255,255,255,0.2)',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              {next.op}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 99,
            background: 'rgba(16,185,129,0.07)',
            border: '1px solid rgba(16,185,129,0.18)',
          }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.8)',
              animation: 'orbBreathe 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 9.5, fontWeight: 700, color: '#10b981',
              letterSpacing: '0.12em', fontFamily: '"JetBrains Mono", monospace',
            }}>
              OPERATIONAL
            </span>
          </div>
          <button
            onClick={() => load(true)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'rgba(255,255,255,0.2)', padding: 5, display: 'flex', borderRadius: 4,
            }}
          >
            <RefreshCcw size={12} />
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 304px',
        gap: 20,
        minHeight: 0,
      }}>
        <OperationsFeed logs={logs} />
        <MissionStatus stats={stats} logs={logs} />
      </div>
    </div>
  )
}
