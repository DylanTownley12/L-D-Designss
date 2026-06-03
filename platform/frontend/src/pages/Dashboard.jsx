import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { dashboard as dashApi, agents as agentsApi, outreach as outreachApi } from '../api/client'
import {
  Crown, Map, Megaphone, Briefcase, Code2, BarChart2, Network,
  Search, ScanSearch, Palette, Gem, Mail, RotateCcw, RefreshCcw,
  Activity, Cpu, TrendingUp, MessageSquare, Bell, Play,
  CheckCircle2, AlertCircle, Zap, ChevronRight, Globe, Camera,
} from 'lucide-react'

const AGENTS = {
  ceo_agent:         { Icon: Crown,      label: 'CEO',          color: '#D4A843' },
  research_agent:    { Icon: Map,        label: 'Research',     color: '#14b8a6' },
  cmo_agent:         { Icon: Megaphone,  label: 'CMO',          color: '#f97316' },
  sales_agent:       { Icon: Briefcase,  label: 'Sales',        color: '#22c55e' },
  dev_agent:         { Icon: Code2,      label: 'Dev',          color: '#94a3b8' },
  analyst_agent:     { Icon: BarChart2,  label: 'Analyst',      color: '#a855f7' },
  orchestrator:      { Icon: Network,    label: 'Orchestrator', color: '#D4A843' },
  lead_finder:       { Icon: Search,     label: 'Lead Finder',  color: '#3b82f6' },
  website_analyzer:  { Icon: ScanSearch, label: 'Analyzer',     color: '#8b5cf6' },
  preview_generator: { Icon: Palette,    label: 'Previews',     color: '#06b6d4' },
  lead_enricher:     { Icon: Gem,        label: 'Enricher',     color: '#ec4899' },
  outreach_writer:   { Icon: Mail,       label: 'Outreach',     color: '#10b981' },
  followup_agent:    { Icon: RotateCcw,  label: 'Follow-up',    color: '#f59e0b' },
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

function useAnimations() {
  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = `
      @keyframes ping { 75%,100% { transform: scale(2); opacity: 0; } }
      @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
    `
    document.head.appendChild(el)
    return () => document.head.removeChild(el)
  }, [])
}

/* ── Live Agent Feed ── */
function LiveFeed({ onAgentActivity }) {
  const [logs, setLogs] = useState([])
  const prevIdsRef = useRef(new Set())

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await agentsApi.logs(null, 35)
        const entries = data.logs || []
        const newIds = new Set(entries.map(l => l.id))
        const marked = entries.map(l => ({ ...l, isNew: !prevIdsRef.current.has(l.id) }))
        prevIdsRef.current = newIds
        setLogs(marked)
        if (onAgentActivity) onAgentActivity(entries)
      } catch {}
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#050508',
      border: '1px solid rgba(212,168,67,0.2)',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 0 40px rgba(0,0,0,0.5), inset 0 0 40px rgba(0,0,0,0.2)',
    }}>
      {/* Terminal chrome */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'rgba(212,168,67,0.05)',
        borderBottom: '1px solid rgba(212,168,67,0.1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444', opacity: 0.7 }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b', opacity: 0.7 }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981', opacity: 0.7 }} />
          <span style={{
            marginLeft: 8,
            fontSize: 10.5,
            fontFamily: '"JetBrains Mono", monospace',
            color: 'rgba(255,255,255,0.3)',
          }}>
            agent-feed · live
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ position: 'relative', width: 6, height: 6 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: '#10b981', opacity: 0.4,
              animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
              transform: 'scale(2)',
            }} />
            <div style={{ position: 'relative', width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.8)' }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', letterSpacing: '0.08em' }}>LIVE</span>
        </div>
      </div>

      {/* Log stream */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 11.5,
        maxHeight: 360,
      }}>
        {logs.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.18)', padding: '16px 0', textAlign: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}>
            waiting for agent activity...
          </div>
        ) : logs.map((log) => {
          const meta = AGENTS[log.agent_name] || { Icon: Cpu, label: log.agent_name, color: '#6b7280' }
          const Icon = meta.Icon
          const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const isErr = log.status === 'error'
          return (
            <div
              key={log.id}
              className={log.isNew ? 'log-entry' : ''}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0' }}
            >
              <span style={{ color: 'rgba(255,255,255,0.18)', flexShrink: 0, width: 64, fontSize: 10.5 }}>{time}</span>
              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', width: 16 }}>
                <Icon size={11} color={meta.color} />
              </span>
              <span style={{ color: meta.color, flexShrink: 0, width: 86, fontWeight: 600, fontSize: 11 }}>
                {meta.label}
              </span>
              <span style={{ color: isErr ? '#f87171' : 'rgba(255,255,255,0.5)', flex: 1, lineHeight: 1.45, fontSize: 11 }}>
                {log.action}
              </span>
              {isErr && <span style={{ color: '#f87171', flexShrink: 0, fontSize: 10 }}>✕</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Agent Fleet Grid ── */
function AgentMiniGrid({ recentLogs }) {
  const now = Date.now()
  return (
    <div style={{
      background: '#0c0c12',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span className="section-label">Agent Fleet</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>{Object.keys(AGENTS).length} agents</span>
      </div>
      <div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, overflowY: 'auto' }}>
        {Object.entries(AGENTS).map(([key, meta]) => {
          const Icon = meta.Icon
          const lastLog = recentLogs.find(l => l.agent_name === key)
          const ageMs = lastLog ? now - new Date(lastLog.created_at).getTime() : Infinity
          const isActive = ageMs < 5 * 60 * 1000
          const isRecent = ageMs < 60 * 60 * 1000
          const isError = lastLog?.status === 'error'
          const dotColor = isError ? '#ef4444' : isActive ? '#10b981' : isRecent ? meta.color : 'rgba(255,255,255,0.1)'

          return (
            <div key={key} style={{
              padding: '8px 9px',
              borderRadius: 9,
              border: `1px solid ${isActive ? meta.color + '38' : 'rgba(255,255,255,0.05)'}`,
              background: isActive ? meta.color + '0a' : 'rgba(255,255,255,0.018)',
              transition: 'all 0.35s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              boxShadow: isActive ? `0 0 14px ${meta.color}18` : 'none',
            }}>
              <div style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: isActive ? meta.color + '20' : 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={13} color={isActive ? meta.color : 'rgba(255,255,255,0.3)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.38)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>{meta.label}</div>
              </div>
              <div style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: dotColor,
                flexShrink: 0,
                boxShadow: isActive ? `0 0 6px ${dotColor}` : 'none',
                ...(isActive ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
              }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Metric Card ── */
function MetricCard({ label, value, sub, color = '#D4A843', icon: Icon }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}0d 0%, #0c0c12 100%)`,
      border: `1px solid ${color}22`,
      borderRadius: 16,
      padding: '18px 20px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 4px 20px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04)`,
    }}>
      <div style={{
        position: 'absolute', top: 0, right: 0,
        width: 100, height: 100,
        background: `radial-gradient(circle at top right, ${color}1a, transparent 65%)`,
        pointerEvents: 'none',
      }} />
      {Icon && (
        <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', opacity: 0.07, pointerEvents: 'none' }}>
          <Icon size={60} color={color} />
        </div>
      )}
      <div style={{
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.11em',
        color: 'rgba(255,255,255,0.28)',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
      }}>
        {Icon && <Icon size={10} color={color} />}
        {label}
      </div>
      <div className="count-anim" style={{
        fontSize: 36,
        fontWeight: 800,
        letterSpacing: '-0.03em',
        color,
        lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
        marginBottom: 5,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>{sub}</div>}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, ${color}45, transparent 55%)`,
      }} />
    </div>
  )
}

/* ── Pipeline Funnel ── */
function PipelineFunnel({ pipeline }) {
  const max = Math.max(...pipeline.map(p => p.count), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {pipeline.map(stage => {
        const pct = stage.count > 0 ? Math.max((stage.count / max) * 100, 4) : 0
        return (
          <div key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              fontSize: 10.5,
              color: 'rgba(255,255,255,0.28)',
              textAlign: 'right',
              flexShrink: 0,
              width: 90,
              fontWeight: 500,
            }}>
              {stage.label}
            </div>
            <div style={{ flex: 1, height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 6, overflow: 'hidden' }}>
              {stage.count > 0 ? (
                <div style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: `linear-gradient(90deg, ${stage.color}dd, ${stage.color}88)`,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 10,
                  transition: 'width 0.8s ease',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>
                    {stage.count}
                  </span>
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>—</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Yesterday Recap ── */
function YesterdayRecap() {
  const [data, setData] = useState(null)
  useEffect(() => {
    dashApi.yesterday().then(setData).catch(() => {})
  }, [])
  if (!data?.agents?.length) return null

  const dateLabel = data.date
    ? new Date(data.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
    : 'Yesterday'

  return (
    <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
      <div className="section-label" style={{ marginBottom: 16 }}>
        What the agents did — {dateLabel}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {data.agents.map(a => {
          const meta = AGENTS[a.agent] || { Icon: Cpu, label: a.agent, color: '#6b7280' }
          const Icon = meta.Icon
          return (
            <div key={a.agent} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${a.errors > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
              background: a.errors > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: a.errors > 0 ? 'rgba(239,68,68,0.15)' : meta.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={13} color={a.errors > 0 ? '#ef4444' : meta.color} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{meta.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{a.runs}×</span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.4, margin: 0 }}
                   className="line-clamp-2">{a.last_action}</p>
                {a.errors > 0 && (
                  <span style={{ fontSize: 10.5, color: '#f87171', marginTop: 3, display: 'block' }}>
                    {a.errors} error{a.errors !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Custom Recharts Tooltip ── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#111118',
      border: '1px solid rgba(212,168,67,0.25)',
      borderRadius: 8,
      padding: '8px 12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
    }}>
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#D4A843' }}>{payload[0].value}</div>
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>messages sent</div>
    </div>
  )
}

/* ── Main Dashboard ── */
export default function Dashboard() {
  useAnimations()

  const [stats, setStats]               = useState(null)
  const [loading, setLoading]           = useState(true)
  const [waking, setWaking]             = useState(false)
  const [error, setError]               = useState(null)
  const [running, setRunning]           = useState(null)
  const [templateStats, setTemplateStats] = useState(null)
  const [conversations, setConversations] = useState([])
  const [recentLogs, setRecentLogs]     = useState([])
  const navigate = useNavigate()

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    const wakeTimer = setTimeout(() => setWaking(true), 5000)
    try {
      const data = await fetchWithRetry(() => dashApi.stats())
      setStats(data)
    } catch (e) {
      setError(e.message)
    } finally {
      clearTimeout(wakeTimer)
      setWaking(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const t = setInterval(() => load(true), 30000)
    outreachApi.templateStats().then(setTemplateStats).catch(() => {})
    outreachApi.conversations(5).then(d => setConversations(d.conversations || [])).catch(() => {})
    return () => clearInterval(t)
  }, [])

  const runAgent = async (agent) => {
    setRunning(agent)
    try {
      await agentsApi.run(agent)
      if (agent === 'outreach_writer') navigate('/outreach?generating=1')
      else alert(`${agent} started — check agent logs for results.`)
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setRunning(null)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
      <svg width="32" height="32" viewBox="0 0 28 28" fill="none" style={{ animation: 'spin 2s linear infinite' }}>
        <path d="M14 2L26 14L14 26L2 14Z" fill="rgba(212,168,67,0.1)" stroke="#D4A843" strokeWidth="1.4"/>
        <path d="M14 8L20 14L14 20L8 14Z" fill="rgba(212,168,67,0.5)"/>
      </svg>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', fontFamily: '"JetBrains Mono", monospace' }}>
        {waking ? 'backend waking up — hang tight...' : 'loading command centre...'}
      </div>
    </div>
  )

  if (error) return (
    <div style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171', fontWeight: 600 }}>
        <AlertCircle size={18} /> Connection failed
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{error}</div>
      <button onClick={() => load()} className="btn-ghost" style={{ width: 'fit-content' }}>
        <RefreshCcw size={13} /> Retry
      </button>
    </div>
  )

  const variants = templateStats?.variants || []
  const bestVariant = [...variants].filter(v => v.sent > 0).sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0]
  const lastSent = stats.last_whatsapp_sent_at
  const minsAgo = lastSent ? Math.floor((Date.now() - new Date(lastSent)) / 60000) : null
  const bazActive = minsAgo !== null && minsAgo < 60 * 20
  const sentPct = Math.min(((stats.whatsapp_today || 0) / 20) * 100, 100)

  return (
    <div style={{ padding: '20px 22px', maxWidth: 1600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '22px 28px',
        background: 'linear-gradient(135deg, rgba(212,168,67,0.09) 0%, rgba(212,168,67,0.02) 40%, transparent 70%)',
        border: '1px solid rgba(212,168,67,0.18)',
        borderRadius: 18,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.04,
          backgroundImage: 'linear-gradient(rgba(212,168,67,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(212,168,67,0.6) 1px, transparent 1px)',
          backgroundSize: '40px 40px', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: -50, right: -20, width: 280, height: 280,
          background: 'radial-gradient(circle, rgba(212,168,67,0.1), transparent 65%)',
          pointerEvents: 'none',
        }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{
              fontSize: 26, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.65) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              L&D DESIGNS
            </h1>
            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)' }} />
            <span style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase',
              fontFamily: '"JetBrains Mono", monospace',
            }}>
              AI Command Centre
            </span>
          </div>
          <p style={{
            fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 7,
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {Object.keys(AGENTS).length} agents · autonomous · uk barber outreach
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 13px', borderRadius: 20,
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.22)',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: '#10b981',
              boxShadow: '0 0 8px rgba(16,185,129,0.7)', animation: 'pulse 2s ease-in-out infinite',
            }} />
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#10b981', letterSpacing: '0.08em' }}>
              SYS OPERATIONAL
            </span>
          </div>
          <button
            onClick={() => load()}
            className="btn-ghost"
            style={{ padding: '6px 10px', fontSize: 13 }}
          >
            <RefreshCcw size={13} />
          </button>
        </div>
      </div>

      {/* ── KEY METRICS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <MetricCard label="Monthly Recurring" value={`£${stats.converted * 15}`} icon={TrendingUp} color="#10b981" />
        <MetricCard label="Total Leads"        value={stats.total_leads}           icon={Search}    color="#3b82f6" />
        <MetricCard label="Outreach Sent"      value={stats.outreach_sent}         icon={Send}      color="#D4A843" sub="all time" />
        <MetricCard label="Replies"            value={stats.replies}               icon={MessageSquare} color="#a855f7" />
        <MetricCard label="Converted"          value={stats.converted}             icon={CheckCircle2} color="#10b981" sub="paying clients" />
      </div>

      {/* ── LIVE FEED + AGENT GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 14, minHeight: 400 }}>
        <LiveFeed onAgentActivity={setRecentLogs} />
        <AgentMiniGrid recentLogs={recentLogs} />
      </div>

      {/* ── TODAY'S TASKS ── */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(212,168,67,0.14)', borderRadius: 16, padding: 18 }}>
        <div className="section-label" style={{ marginBottom: 14, color: 'rgba(212,168,67,0.5)' }}>Today's Tasks</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {[
            { label: 'WhatsApp to Send', value: stats.whatsapp_queued,   icon: MessageSquare, link: '/outreach', hot: true,  color: '#22c55e' },
            { label: 'Instagram Ready',  value: stats.instagram_ready,   icon: Camera,        link: '/outreach', hot: true,  color: '#a855f7' },
            { label: 'Awaiting Reply',   value: stats.followups_waiting, icon: RotateCcw,     link: '/leads',    hot: false, color: '#3b82f6' },
            { label: 'Need Attention',   value: stats.need_attention,    icon: AlertCircle,   link: '/leads',    hot: true,  color: '#D4A843' },
          ].map(t => {
            const Icon = t.icon
            const active = t.hot && t.value > 0
            return (
              <a key={t.label} href={t.link} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '14px 14px 12px',
                borderRadius: 12,
                textDecoration: 'none',
                border: `1px solid ${active ? t.color + '35' : 'rgba(255,255,255,0.06)'}`,
                background: active ? t.color + '0a' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.18s ease',
                boxShadow: active ? `0 0 20px ${t.color}12` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: active ? t.color + '18' : 'rgba(255,255,255,0.05)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon size={14} color={active ? t.color : 'rgba(255,255,255,0.25)'} />
                  </div>
                  <ChevronRight size={13} color="rgba(255,255,255,0.15)" />
                </div>
                <div style={{
                  fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em',
                  color: active ? t.color : 'rgba(255,255,255,0.25)',
                  lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                }}>
                  {t.value > 0 ? t.value : '—'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', lineHeight: 1.3 }}>
                  {t.label}
                </div>
              </a>
            )
          })}
        </div>
      </div>

      {/* ── BAZ + SENDS + OPENER ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {/* Baz / OpenClaw */}
        <div style={{
          background: `linear-gradient(135deg, ${bazActive ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.07)'} 0%, #0c0c12 100%)`,
          borderRadius: 16,
          padding: 18,
          border: `1px solid ${bazActive ? 'rgba(16,185,129,0.22)' : 'rgba(239,68,68,0.2)'}`,
          boxShadow: bazActive ? '0 0 24px rgba(16,185,129,0.07)' : '0 0 20px rgba(239,68,68,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span className="section-label">Baz / OpenClaw</span>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 9px', borderRadius: 20,
              background: bazActive ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.15)',
              color: bazActive ? '#10b981' : '#ef4444',
              border: `1px solid ${bazActive ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
              letterSpacing: '0.06em',
            }}>
              {bazActive ? 'LIVE' : 'CHECK SESSION'}
            </span>
          </div>
          <div style={{
            fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em',
            color: bazActive ? '#10b981' : '#ef4444',
            marginBottom: 5, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            {bazActive ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
            {bazActive ? 'Active' : 'Inactive'}
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.28)', marginBottom: bazActive ? 0 : 10 }}>
            Last WA: {minsAgo === null ? 'never' : minsAgo >= 60 ? `${Math.floor(minsAgo / 60)}h ago` : `${minsAgo}m ago`}
          </div>
          {!bazActive && (
            <div style={{
              marginTop: 10, fontSize: 10, fontFamily: '"JetBrains Mono", monospace',
              color: 'rgba(239,68,68,0.65)', background: 'rgba(239,68,68,0.08)',
              borderRadius: 6, padding: '6px 10px', border: '1px solid rgba(239,68,68,0.15)',
            }}>
              openclaw channels login --channel whatsapp
            </div>
          )}
        </div>

        {/* Today's Sends */}
        {(() => {
          const sent = stats.whatsapp_today || 0
          const limit = 20
          return (
            <div style={{ background: '#0c0c12', borderRadius: 16, padding: 18, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="section-label">Today's Sends</span>
                <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)' }}>/{limit} limit</span>
              </div>
              <div style={{
                fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', color: '#D4A843',
                marginBottom: 12, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              }}>
                {sent}
              </div>
              <div style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 5, overflow: 'hidden', marginBottom: 8,
              }}>
                <div style={{
                  height: '100%', borderRadius: 99, transition: 'width 0.7s ease',
                  width: `${sentPct}%`,
                  background: sent >= limit
                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                    : 'linear-gradient(90deg, #D4A843, #F0C96A)',
                }} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>
                {sent >= limit ? 'Daily limit reached ✓' : `${limit - sent} remaining today`}
              </div>
            </div>
          )
        })()}

        {/* Winning opener */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, #0c0c12 100%)',
          borderRadius: 16, padding: 18,
          border: '1px solid rgba(168,85,247,0.2)',
          boxShadow: '0 0 24px rgba(168,85,247,0.06)',
        }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Winning Opener</div>
          {bestVariant ? (
            <>
              <div style={{
                fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: '#a855f7',
                marginBottom: 5, lineHeight: 1,
              }}>
                {bestVariant.reply_rate?.toFixed(1)}%
                <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>reply rate</span>
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginBottom: 10 }}>
                V{bestVariant.variant} · {bestVariant.sent} sent · {bestVariant.replied} replied
              </div>
              <div style={{
                fontSize: 11, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic',
                background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px',
                border: '1px solid rgba(255,255,255,0.05)', lineHeight: 1.5,
              }} className="line-clamp-2">
                "{bestVariant.preview}"
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.28)', marginBottom: 6 }}>No data yet</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)' }}>Send more to see which opener wins</div>
            </>
          )}
        </div>
      </div>

      {/* ── CHARTS ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 14 }}>
        {/* Bar chart */}
        <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '20px 20px 14px' }}>
          <div className="section-label" style={{ marginBottom: 16 }}>7-Day Outreach</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={stats.activity || []} barSize={20} barGap={4}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
                tickFormatter={d => d.slice(5)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.25)', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={24}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="sent" radius={[5, 5, 0, 0]}>
                {(stats.activity || []).map((entry, index) => (
                  <Cell key={index} fill="url(#goldGrad)" />
                ))}
              </Bar>
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F0C96A" />
                  <stop offset="100%" stopColor="#D4A843" stopOpacity={0.7} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline funnel */}
        <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Pipeline Funnel</div>
          <PipelineFunnel pipeline={stats.pipeline || []} />
        </div>
      </div>

      {/* ── WINS / CLIENTS ── */}
      {stats.converted > 0 ? (
        <div style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.07) 0%, #0c0c12 100%)',
          border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 20,
          boxShadow: '0 0 40px rgba(16,185,129,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <CheckCircle2 size={14} color="#10b981" />
            <span className="section-label" style={{ color: 'rgba(16,185,129,0.6)' }}>
              Paying Clients — {stats.converted}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {(stats.wins || []).map((w, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.14)',
                borderRadius: 12, padding: '10px 14px',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: 'rgba(16,185,129,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <CheckCircle2 size={14} color="#10b981" />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.business_name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{w.city}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{
          background: '#0c0c12', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 16, padding: '32px', textAlign: 'center',
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'rgba(212,168,67,0.08)',
            border: '1px solid rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px',
          }}>
            <Zap size={22} color="#D4A843" style={{ opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 6 }}>First client incoming</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>Keep sending — it only takes one yes</div>
        </div>
      )}

      {/* ── YESTERDAY RECAP ── */}
      <YesterdayRecap />

      {/* ── BAZ CONVERSATIONS ── */}
      {conversations.length > 0 && (
        <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div className="section-label" style={{ marginBottom: 16 }}>Recent Replies — Baz Conversations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {conversations.map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{c.lead?.business_name || 'Unknown'}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{c.lead?.city}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: '"JetBrains Mono", monospace' }}>
                    {c.at ? new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {c.we_sent && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <span style={{ fontSize: 10.5, color: 'rgba(212,168,67,0.55)', flexShrink: 0, width: 50, textAlign: 'right', paddingTop: 6 }}>Dylan</span>
                      <div style={{ background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.14)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.5)', flex: 1, lineHeight: 1.5 }}>{c.we_sent}</div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <span style={{ fontSize: 10.5, color: 'rgba(59,130,246,0.55)', flexShrink: 0, width: 50, textAlign: 'right', paddingTop: 6 }}>Barber</span>
                    <div style={{ background: 'rgba(59,130,246,0.07)', border: '1px solid rgba(59,130,246,0.14)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.75)', flex: 1, lineHeight: 1.5 }}>{c.barber_said}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {stats.notifications?.length > 0 && (
        <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={13} color="rgba(255,255,255,0.3)" />
              <span className="section-label">Notifications</span>
              {stats.unread_notifications > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
                  background: 'rgba(212,168,67,0.15)', color: '#D4A843',
                  border: '1px solid rgba(212,168,67,0.25)',
                }}>
                  {stats.unread_notifications} new
                </span>
              )}
            </div>
            <button
              onClick={() => dashApi.markRead().then(() => load(true))}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Mark all read
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats.notifications.map(n => (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 10,
                background: n.read ? 'rgba(255,255,255,0.02)' : 'rgba(212,168,67,0.05)',
                border: `1px solid ${n.read ? 'rgba(255,255,255,0.04)' : 'rgba(212,168,67,0.14)'}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: n.read ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.85)', fontWeight: n.read ? 400 : 500 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                </div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', flexShrink: 0, fontFamily: '"JetBrains Mono", monospace' }}>
                  {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RUN AGENTS MANUALLY ── */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
        <div className="section-label" style={{ marginBottom: 14 }}>Agent Tools</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { agent: 'lead_finder',        label: 'Find Leads',      Icon: Search },
            { agent: 'website_analyzer',   label: 'Analyse Sites',   Icon: ScanSearch },
            { agent: 'preview_generator',  label: 'Gen Previews',    Icon: Globe },
            { agent: 'whatsapp_campaign',  label: 'WhatsApp Queue',  Icon: MessageSquare },
            { agent: 'instagram_campaign', label: 'Instagram Queue', Icon: Camera },
            { agent: 'outreach_writer',    label: 'Write Emails',    Icon: Mail },
            { agent: 'followup_agent',     label: 'Follow-ups',      Icon: RotateCcw },
            { agent: 'outreach_queue',     label: 'Send Emails',     Icon: Send },
          ].map(a => {
            const Icon = a.Icon
            const isRunning = running === a.agent
            return (
              <button
                key={a.agent}
                onClick={() => runAgent(a.agent)}
                disabled={!!running}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: isRunning ? 'rgba(212,168,67,0.1)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isRunning ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  color: isRunning ? '#D4A843' : 'rgba(255,255,255,0.5)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: running ? 'not-allowed' : 'pointer',
                  opacity: running && !isRunning ? 0.4 : 1,
                  transition: 'all 0.15s ease',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                {isRunning
                  ? <div style={{ width: 14, height: 14, border: '1.5px solid #D4A843', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                  : <Icon size={13} style={{ flexShrink: 0 }} />
                }
                <span>{isRunning ? 'Running…' : a.label}</span>
              </button>
            )
          })}
        </div>
      </div>

    </div>
  )
}
