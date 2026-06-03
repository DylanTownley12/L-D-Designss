import { useState, useEffect, useRef } from 'react'
import { dashboard as dashApi, agents as agentsApi } from '../api/client'
import { RefreshCcw, AlertCircle, Cpu } from 'lucide-react'

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
  preview_generator: { label: 'Previews',     color: '#06b6d4' },
  lead_enricher:     { label: 'Enricher',     color: '#ec4899' },
  outreach_writer:   { label: 'Outreach',     color: '#10b981' },
  followup_agent:    { label: 'Follow-up',    color: '#f59e0b' },
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
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  return `${Math.floor(d / 3600000)}h ago`
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

/* ── Central AI Orb ── */
function AICore({ logs }) {
  const entries = Object.entries(AGENTS)
  const n = entries.length
  const activeCount = entries.filter(([k]) => agentStatus(k, logs) === 'active').length

  return (
    <div style={{ position: 'relative', width: 400, height: 400, flexShrink: 0 }}>
      <svg
        width="400" height="400"
        viewBox="-200 -200 400 400"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <radialGradient id="coreGrad" cx="38%" cy="32%" r="65%">
            <stop offset="0%"   stopColor="#F0C96A" stopOpacity="0.45" />
            <stop offset="50%"  stopColor="#D4A843" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#07070b" stopOpacity="0.95" />
          </radialGradient>
          <radialGradient id="haloGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#D4A843" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#D4A843" stopOpacity="0" />
          </radialGradient>
          <filter id="satGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="coreGlowF" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <clipPath id="coreClip">
            <circle cx="0" cy="0" r="59" />
          </clipPath>
        </defs>

        {/* Outermost ambient halo */}
        <circle cx="0" cy="0" r="190"
          fill="url(#haloGrad)"
          style={{ animation: 'orbBreathe 5s ease-in-out infinite' }}
        />

        {/* Static guide circle */}
        <circle cx="0" cy="0" r="175" fill="none"
          stroke="rgba(212,168,67,0.05)" strokeWidth="1"
        />

        {/* Outer rotating dashed ring */}
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 75s linear infinite' }}>
          <circle cx="0" cy="0" r="175" fill="none"
            stroke="rgba(212,168,67,0.2)"
            strokeWidth="0.7"
            strokeDasharray="3 20"
          />
        </g>

        {/* Agent satellite dots — fixed positions on outer orbit */}
        {entries.map(([key, meta], i) => {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2
          const x = Math.cos(angle) * 175
          const y = Math.sin(angle) * 175
          const status = agentStatus(key, logs)
          const active = status === 'active'
          const error  = status === 'error'
          const recent = status === 'recent'
          const col    = error ? '#ef4444' : meta.color

          return (
            <g key={key} filter={active || error ? 'url(#satGlow)' : undefined}>
              {(active || error) && (
                <circle cx={x} cy={y} r="13" fill={col} opacity="0.1"
                  style={{ animation: 'orbBreathe 2.5s ease-in-out infinite' }}
                />
              )}
              <circle
                cx={x} cy={y}
                r={active ? 5.5 : recent ? 3.5 : 2.5}
                fill={active ? col : recent ? col + '55' : 'rgba(255,255,255,0.1)'}
              />
            </g>
          )
        })}

        {/* Middle ring — counter-rotate */}
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 48s linear infinite reverse' }}>
          <circle cx="0" cy="0" r="128" fill="none"
            stroke="rgba(212,168,67,0.12)"
            strokeWidth="0.8"
            strokeDasharray="10 5"
          />
          <circle cx="0" cy="-128" r="3.5" fill="#D4A843" opacity="0.85" />
          <circle cx="0" cy="128"  r="2"   fill="rgba(212,168,67,0.4)" />
        </g>

        {/* Inner ring — forward */}
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 22s linear infinite' }}>
          <circle cx="0" cy="0" r="88" fill="none"
            stroke="rgba(6,182,212,0.22)"
            strokeWidth="0.5"
          />
          <circle cx="0" cy="-88" r="2.5" fill="#06b6d4" opacity="0.9" />
          <circle cx="62"  cy="63" r="1.5" fill="rgba(6,182,212,0.5)" />
        </g>

        {/* Core ambient glow */}
        <circle cx="0" cy="0" r="70" fill="rgba(212,168,67,0.07)"
          filter="url(#coreGlowF)"
          style={{ animation: 'orbBreathe 3.5s ease-in-out infinite' }}
        />

        {/* Core sphere */}
        <circle cx="0" cy="0" r="61"
          fill="url(#coreGrad)"
          stroke="rgba(212,168,67,0.3)"
          strokeWidth="0.8"
        />

        {/* Specular highlight */}
        <ellipse cx="-14" cy="-18" rx="20" ry="16"
          fill="rgba(240,201,106,0.09)"
        />

        {/* Scan line (clipped to core) */}
        <rect x="-62" y="0" width="124" height="1.2"
          fill="rgba(212,168,67,0.28)"
          clipPath="url(#coreClip)"
          style={{ animation: 'coresScan 3.2s ease-in-out infinite' }}
        />

        {/* Center node */}
        <circle cx="0" cy="0" r="4.5" fill="#D4A843" opacity="0.9"
          style={{ animation: 'orbBreathe 2s ease-in-out infinite' }}
        />
      </svg>

      {/* Active agent count — HTML overlay centred on the orb core */}
      <div style={{
        position: 'absolute',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -46%)',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>
        <div style={{
          fontSize: 22,
          fontWeight: 800,
          color: '#D4A843',
          fontFamily: '"JetBrains Mono", monospace',
          letterSpacing: '-0.02em',
          lineHeight: 1,
          textShadow: '0 0 20px rgba(212,168,67,0.5)',
        }}>
          {activeCount}
        </div>
        <div style={{
          fontSize: 7.5,
          fontWeight: 700,
          letterSpacing: '0.22em',
          color: 'rgba(212,168,67,0.4)',
          textTransform: 'uppercase',
          fontFamily: '"JetBrains Mono", monospace',
          marginTop: 2,
        }}>
          ACTIVE
        </div>
      </div>
    </div>
  )
}

/* ── Operational Intelligence ── */
function OperationalIntel({ stats, logs }) {
  if (!stats) return null

  const lastSent = stats.last_whatsapp_sent_at
  const minsAgo  = lastSent ? Math.floor((Date.now() - new Date(lastSent)) / 60000) : null
  const bazLive  = minsAgo !== null && minsAgo < 20 * 60

  const activeLabels = Object.entries(AGENTS)
    .filter(([k]) => agentStatus(k, logs) === 'active')
    .map(([, m]) => m.label)

  const items = [
    {
      color: '#3b82f6',
      text: `${(stats.total_leads || 0).toLocaleString()} leads in pipeline · ${stats.outreach_sent || 0} contacted · ${stats.replies || 0} replied`,
    },
    {
      color: bazLive ? '#10b981' : '#ef4444',
      text: bazLive
        ? `Baz responding autonomously · last WhatsApp ${minsAgo === 0 ? 'just now' : `${minsAgo}m ago`}`
        : 'Baz needs attention · run: openclaw channels login --channel whatsapp',
      mono: !bazLive,
    },
    {
      color: activeLabels.length > 0 ? '#a855f7' : 'rgba(255,255,255,0.18)',
      text: activeLabels.length > 0
        ? `${activeLabels.length} agent${activeLabels.length > 1 ? 's' : ''} running now · ${activeLabels.join(' · ')}`
        : `${Object.keys(AGENTS).length} agents on standby · next trigger 6am`,
    },
    {
      color: stats.converted > 0 ? '#10b981' : 'rgba(255,255,255,0.16)',
      text: stats.converted > 0
        ? `${stats.converted} paying client${stats.converted > 1 ? 's' : ''} · £${stats.converted * 15}/month recurring`
        : 'No clients yet — pipeline active · first conversion incoming',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '9px 14px',
          borderRadius: 8,
          background: `${item.color}09`,
          border: `1px solid ${item.color}1a`,
        }}>
          <div style={{
            width: 5, height: 5,
            borderRadius: '50%',
            background: item.color,
            boxShadow: `0 0 8px ${item.color}`,
            flexShrink: 0,
            marginTop: 4,
          }} />
          <span style={{
            fontSize: 11.5,
            color: 'rgba(255,255,255,0.5)',
            lineHeight: 1.55,
            fontFamily: item.mono ? '"JetBrains Mono", monospace' : 'Inter, sans-serif',
          }}>
            {item.text}
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Mission Control Feed ── */
function MissionFeed({ logs }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#050508',
      border: '1px solid rgba(212,168,67,0.14)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Chrome bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 16px',
        borderBottom: '1px solid rgba(212,168,67,0.08)',
        background: 'rgba(212,168,67,0.025)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {['#ef4444', '#f59e0b', '#10b981'].map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.6 }} />
            ))}
          </div>
          <span style={{
            marginLeft: 6,
            fontSize: 10.5,
            fontFamily: '"JetBrains Mono", monospace',
            color: 'rgba(255,255,255,0.22)',
            letterSpacing: '0.04em',
          }}>
            mission-control
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 7px rgba(16,185,129,0.8)',
            animation: 'orbBreathe 1.8s ease-in-out infinite',
          }} />
          <span style={{
            fontSize: 9.5, fontWeight: 700,
            color: '#10b981',
            letterSpacing: '0.12em',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            LIVE
          </span>
        </div>
      </div>

      {/* Stream */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '6px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}>
        {logs.length === 0 ? (
          <div style={{
            padding: '32px 0',
            textAlign: 'center',
            color: 'rgba(255,255,255,0.12)',
            fontSize: 11,
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            awaiting agent activity...
          </div>
        ) : logs.map((log) => {
          const meta   = AGENTS[log.agent_name] || { label: log.agent_name, color: '#6b7280' }
          const isNew  = log.isNew
          const isErr  = log.status === 'error'

          return (
            <div
              key={log.id}
              className={isNew ? 'feed-entry' : ''}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '4px 6px',
                borderRadius: 5,
                borderLeft: `2px solid ${isNew ? meta.color + '55' : 'transparent'}`,
                background: isNew ? `${meta.color}09` : 'transparent',
                transition: 'background 0.6s ease, border-color 0.6s ease',
              }}
            >
              <span style={{
                fontSize: 9.5,
                color: 'rgba(255,255,255,0.18)',
                fontFamily: '"JetBrains Mono", monospace',
                width: 52,
                flexShrink: 0,
                paddingTop: 1,
              }}>
                {relTime(log.created_at)}
              </span>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                color: isErr ? '#ef4444' : meta.color,
                width: 72,
                flexShrink: 0,
                paddingTop: 1,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {meta.label}
              </span>
              <span style={{
                fontSize: 11,
                color: isErr
                  ? '#f87171'
                  : isNew
                  ? 'rgba(255,255,255,0.72)'
                  : 'rgba(255,255,255,0.32)',
                flex: 1,
                lineHeight: 1.45,
                fontFamily: '"JetBrains Mono", monospace',
              }}>
                {log.action}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main ── */
export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking]   = useState(false)
  const [error, setError]     = useState(null)
  const [logs, setLogs]       = useState([])
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
        const data    = await agentsApi.logs(null, 60)
        const entries = data.logs || []
        const ids     = new Set(entries.map(l => l.id))
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

  /* Loading screen */
  if (loading) return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 22,
    }}>
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
        <circle cx="0" cy="0" r="9" fill="rgba(212,168,67,0.08)" stroke="rgba(212,168,67,0.25)" strokeWidth="0.5"
          style={{ animation: 'orbBreathe 2s ease-in-out infinite' }} />
        <circle cx="0" cy="0" r="2.5" fill="#D4A843"
          style={{ animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
      </svg>
      <div style={{
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 10.5,
        color: 'rgba(255,255,255,0.2)',
        letterSpacing: '0.16em',
      }}>
        {waking ? 'WAKING BACKEND...' : 'INITIALISING AI CORE...'}
      </div>
    </div>
  )

  /* Error screen */
  if (error) return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      height: '100vh', gap: 14,
    }}>
      <AlertCircle size={22} color="#ef4444" />
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: '"JetBrains Mono", monospace' }}>
        CONNECTION FAILED: {error}
      </div>
      <button
        onClick={load}
        style={{
          background: 'none',
          border: '1px solid rgba(212,168,67,0.3)',
          color: '#D4A843',
          fontSize: 11,
          fontFamily: '"JetBrains Mono", monospace',
          padding: '6px 18px',
          borderRadius: 6,
          cursor: 'pointer',
          letterSpacing: '0.1em',
        }}
      >
        RETRY
      </button>
    </div>
  )

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      padding: '16px 20px',
      gap: 14,
      boxSizing: 'border-box',
    }}>

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: '#D4A843',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            L&D.AI
          </span>
          <span style={{
            fontSize: 9.5,
            color: 'rgba(255,255,255,0.18)',
            fontFamily: '"JetBrains Mono", monospace',
            letterSpacing: '0.14em',
          }}>
            / AI OPERATING SYSTEM / {Object.keys(AGENTS).length} AGENTS
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 11px',
            borderRadius: 99,
            background: 'rgba(16,185,129,0.08)',
            border: '1px solid rgba(16,185,129,0.2)',
          }}>
            <div style={{
              width: 5, height: 5,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 6px rgba(16,185,129,0.8)',
              animation: 'orbBreathe 2s ease-in-out infinite',
            }} />
            <span style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: '#10b981',
              letterSpacing: '0.12em',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              OPERATIONAL
            </span>
          </div>
          <button
            onClick={() => load(true)}
            style={{
              background: 'none', border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.22)',
              padding: 5,
              display: 'flex',
              borderRadius: 4,
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
        gridTemplateColumns: '1fr 360px',
        gap: 16,
        minHeight: 0,
      }}>

        {/* LEFT: AI Core + Operational Intel */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 28,
          overflow: 'hidden',
        }}>
          <AICore logs={logs} />

          <div style={{ width: '100%', maxWidth: 490 }}>
            <div style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.13)',
              textTransform: 'uppercase',
              fontFamily: '"JetBrains Mono", monospace',
              marginBottom: 10,
            }}>
              OPERATIONAL INTELLIGENCE
            </div>
            <OperationalIntel stats={stats} logs={logs} />
          </div>
        </div>

        {/* RIGHT: Mission Control Feed */}
        <MissionFeed logs={logs} />
      </div>

    </div>
  )
}
