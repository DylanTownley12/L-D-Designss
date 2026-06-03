import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { dashboard as dashApi, agents as agentsApi, outreach as outreachApi } from '../api/client'

const AGENTS = {
  ceo_agent:         { icon: '👔', label: 'CEO',          color: '#C9A84C' },
  research_agent:    { icon: '🗺️', label: 'Research',      color: '#14b8a6' },
  cmo_agent:         { icon: '📣', label: 'CMO',          color: '#f97316' },
  sales_agent:       { icon: '💼', label: 'Sales',        color: '#22c55e' },
  dev_agent:         { icon: '⚙️',  label: 'Dev',          color: '#94a3b8' },
  analyst_agent:     { icon: '📊', label: 'Analyst',      color: '#a855f7' },
  orchestrator:      { icon: '🧠', label: 'Orchestrator', color: '#C9A84C' },
  lead_finder:       { icon: '🔍', label: 'Lead Finder',  color: '#3b82f6' },
  website_analyzer:  { icon: '🔬', label: 'Analyzer',     color: '#8b5cf6' },
  preview_generator: { icon: '🎨', label: 'Previews',     color: '#06b6d4' },
  lead_enricher:     { icon: '💎', label: 'Enricher',     color: '#ec4899' },
  outreach_writer:   { icon: '✉️',  label: 'Outreach',     color: '#10b981' },
  followup_agent:    { icon: '🔁', label: 'Follow-up',    color: '#f59e0b' },
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

// ── Inject keyframe animations once ────────────────────────────────────────
function useAnimations() {
  useEffect(() => {
    const el = document.createElement('style')
    el.textContent = `
      @keyframes fadeSlideIn {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes borderGlow {
        0%, 100% { opacity: 0.6; } 50% { opacity: 1; }
      }
      @keyframes scanline {
        0%   { top: 0%; opacity: 0.07; }
        100% { top: 100%; opacity: 0; }
      }
      @keyframes countUp {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .log-entry  { animation: fadeSlideIn 0.25s ease; }
      .glow-border { animation: borderGlow 2.5s ease-in-out infinite; }
      .count-anim { animation: countUp 0.4s ease; }
    `
    document.head.appendChild(el)
    return () => document.head.removeChild(el)
  }, [])
}

// ── Live Agent Feed (terminal) ──────────────────────────────────────────────
function LiveFeed({ onAgentActivity }) {
  const [logs, setLogs] = useState([])
  const [tick, setTick] = useState(0)
  const prevIdsRef = useRef(new Set())

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await agentsApi.logs(null, 30)
        const entries = data.logs || []
        const newIds = new Set(entries.map(l => l.id))
        // mark new ones
        const marked = entries.map(l => ({
          ...l,
          isNew: !prevIdsRef.current.has(l.id),
        }))
        prevIdsRef.current = newIds
        setLogs(marked)
        if (onAgentActivity) onAgentActivity(entries)
      } catch {}
      setTick(t => t + 1)
    }
    poll()
    const t = setInterval(poll, 3000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col h-full" style={{
      background: '#050508',
      border: '1px solid rgba(201,168,76,0.18)',
      borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Terminal chrome */}
      <div className="flex items-center justify-between px-4 py-3" style={{
        background: 'rgba(201,168,76,0.06)',
        borderBottom: '1px solid rgba(201,168,76,0.12)',
      }}>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500/70" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
          <span className="w-3 h-3 rounded-full bg-green-500/70" />
          <span className="ml-3 text-xs font-mono text-white/40">agent-feed — live</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 absolute" />
          <span className="text-xs font-mono text-green-400 ml-1">LIVE</span>
        </div>
      </div>

      {/* Log lines */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-0.5 font-mono text-xs" style={{ maxHeight: 340 }}>
        {logs.length === 0 ? (
          <div className="text-white/20 py-4 text-center">Waiting for agent activity...</div>
        ) : logs.map((log, i) => {
          const meta = AGENTS[log.agent_name] || { icon: '🤖', label: log.agent_name, color: '#6b7280' }
          const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const isErr = log.status === 'error'
          return (
            <div
              key={log.id}
              className={log.isNew ? 'log-entry' : ''}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '3px 0' }}
            >
              <span style={{ color: 'rgba(255,255,255,0.2)', flexShrink: 0, width: 64 }}>{time}</span>
              <span style={{ flexShrink: 0 }}>{meta.icon}</span>
              <span style={{ color: meta.color, flexShrink: 0, width: 88, fontWeight: 600 }}>
                {meta.label}
              </span>
              <span style={{ color: isErr ? '#f87171' : 'rgba(255,255,255,0.55)', flex: 1, lineHeight: 1.4 }}>
                {log.action}
              </span>
              {isErr && <span style={{ color: '#f87171', flexShrink: 0 }}>✕</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Agent Mini Grid ─────────────────────────────────────────────────────────
function AgentMiniGrid({ recentLogs }) {
  const now = Date.now()

  return (
    <div style={{
      background: '#050508',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 16,
      padding: 16,
      height: '100%',
    }}>
      <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">
        Agent Status
      </div>
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(AGENTS).map(([key, meta]) => {
          const lastLog = recentLogs.find(l => l.agent_name === key)
          const ageMs = lastLog ? now - new Date(lastLog.created_at).getTime() : Infinity
          const isActive = ageMs < 5 * 60 * 1000   // active in last 5 min
          const isRecent = ageMs < 60 * 60 * 1000  // active in last hour
          const isError = lastLog?.status === 'error'

          const dotColor = isError ? '#ef4444' : isActive ? '#10b981' : isRecent ? meta.color : 'rgba(255,255,255,0.15)'

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 10px',
                borderRadius: 10,
                border: `1px solid ${isActive ? meta.color + '40' : 'rgba(255,255,255,0.05)'}`,
                background: isActive ? meta.color + '0d' : 'rgba(255,255,255,0.02)',
                transition: 'all 0.4s ease',
                boxShadow: isActive ? `0 0 12px ${meta.color}22` : 'none',
              }}
            >
              <span style={{ fontSize: 14 }}>{meta.icon}</span>
              <span style={{ fontSize: 11, color: isActive ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.35)', fontWeight: 500, flex: 1 }}>
                {meta.label}
              </span>
              <span
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: dotColor,
                  flexShrink: 0,
                  boxShadow: isActive ? `0 0 6px ${dotColor}` : 'none',
                }}
                className={isActive ? 'animate-pulse' : ''}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Big metric card ─────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = '#C9A84C', icon }) {
  return (
    <div style={{
      background: '#050508',
      border: `1px solid ${color}28`,
      borderRadius: 16,
      padding: '18px 20px',
      boxShadow: `0 0 24px ${color}12`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: `radial-gradient(circle at top right, ${color}18, transparent 70%)`,
        pointerEvents: 'none',
      }} />
      <div className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
        {icon && <span className="mr-1">{icon}</span>}{label}
      </div>
      <div className="count-anim text-3xl font-bold tabular-nums" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>{sub}</div>}
    </div>
  )
}

// ── Pipeline funnel ─────────────────────────────────────────────────────────
function PipelineFunnel({ pipeline }) {
  const max = Math.max(...pipeline.map(p => p.count), 1)
  return (
    <div className="space-y-2">
      {pipeline.map(stage => {
        const pct = stage.count > 0 ? Math.max((stage.count / max) * 100, 5) : 0
        return (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="text-xs text-white/30 text-right flex-shrink-0" style={{ width: 84 }}>{stage.label}</div>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 26, background: 'rgba(255,255,255,0.04)' }}>
              {stage.count > 0 ? (
                <div className="h-full rounded-full flex items-center px-3 transition-all duration-700"
                  style={{ width: `${pct}%`, background: stage.color }}>
                  <span className="text-xs font-bold text-white/90 whitespace-nowrap">{stage.count}</span>
                </div>
              ) : (
                <div className="h-full flex items-center px-3">
                  <span className="text-xs text-white/20">—</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Yesterday recap ─────────────────────────────────────────────────────────
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
    <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
      <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">
        What the agents did — {dateLabel}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {data.agents.map(a => {
          const meta = AGENTS[a.agent] || { icon: '🤖', label: a.agent, color: '#6b7280' }
          return (
            <div key={a.agent} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${a.errors > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
              background: a.errors > 0 ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.02)',
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{meta.icon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>{meta.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>{a.runs}×</span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4, margin: 0 }}
                   className="line-clamp-2">{a.last_action}</p>
                {a.errors > 0 && (
                  <span style={{ fontSize: 11, color: '#f87171', marginTop: 2, display: 'block' }}>
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

// ── Main Dashboard ──────────────────────────────────────────────────────────
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
    <div className="p-8 space-y-2">
      <div className="text-white/40 text-sm font-mono">Initialising command centre...</div>
      {waking && <div className="text-white/25 text-xs font-mono">Backend waking up — give it a moment...</div>}
    </div>
  )
  if (error) return (
    <div className="p-8 space-y-3">
      <div className="text-red-400 font-medium">Connection failed.</div>
      <div className="text-white/30 text-sm">{error}</div>
      <button onClick={() => load()} className="btn-ghost text-sm mt-2">↻ Retry</button>
    </div>
  )

  const variants = templateStats?.variants || []
  const bestVariant = [...variants].filter(v => v.sent > 0).sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0]
  const lastSent = stats.last_whatsapp_sent_at
  const minsAgo = lastSent ? Math.floor((Date.now() - new Date(lastSent)) / 60000) : null
  const bazActive = minsAgo !== null && minsAgo < 60 * 20

  return (
    <div className="p-5 max-w-screen-2xl mx-auto space-y-5">

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px',
        background: 'linear-gradient(135deg, rgba(201,168,76,0.08) 0%, rgba(0,0,0,0) 60%)',
        border: '1px solid rgba(201,168,76,0.15)',
        borderRadius: 16,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.03,
          backgroundImage: 'linear-gradient(rgba(201,168,76,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(201,168,76,0.5) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          pointerEvents: 'none',
        }} />
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight" style={{ letterSpacing: '-0.02em' }}>
              L&D DESIGNS
            </h1>
            <span className="text-white/20 text-xl">—</span>
            <span className="text-sm font-mono text-white/40 uppercase tracking-widest">Command Centre</span>
          </div>
          <p className="text-xs text-white/25 mt-1 font-mono">
            {Object.keys(AGENTS).length} AI agents · running 24/7 · UK barber outreach
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400" />
            </span>
            <span className="text-xs font-mono text-green-400">SYS OPERATIONAL</span>
          </div>
          <button onClick={() => load()} className="btn-ghost text-xs">↻</button>
        </div>
      </div>

      {/* ── KEY METRICS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Monthly Recurring" value={`£${stats.converted * 15}`} icon="💰" color="#10b981" />
        <MetricCard label="Total Leads" value={stats.total_leads} icon="🎯" color="#3b82f6" />
        <MetricCard label="Outreach Sent" value={stats.outreach_sent} sub="all time" icon="📤" color="#C9A84C" />
        <MetricCard label="Replies" value={stats.replies} icon="💬" color="#a855f7" />
        <MetricCard label="Converted" value={stats.converted} sub="paying clients" icon="💷" color="#10b981" />
      </div>

      {/* ── LIVE FEED + AGENT GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        <div className="lg:col-span-2">
          <LiveFeed onAgentActivity={setRecentLogs} />
        </div>
        <div>
          <AgentMiniGrid recentLogs={recentLogs} />
        </div>
      </div>

      {/* ── TODAY'S TASKS ── */}
      <div style={{ background: '#050508', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 16, padding: 20 }}>
        <div className="text-xs font-semibold text-gold/60 uppercase tracking-widest mb-4">Today's Tasks</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'WhatsApp to Send', value: stats.whatsapp_queued, icon: '💬', link: '/outreach', hot: true },
            { label: 'Instagram Ready',  value: stats.instagram_ready, icon: '📸', link: '/outreach', hot: true },
            { label: 'Awaiting Reply',   value: stats.followups_waiting, icon: '🔁', link: '/leads', hot: false },
            { label: 'Need Attention',   value: stats.need_attention, icon: '🔥', link: '/leads', hot: true },
          ].map(t => (
            <a key={t.label} href={t.link} style={{
              display: 'block', textAlign: 'center', padding: '16px 12px', borderRadius: 12, textDecoration: 'none',
              border: `1px solid ${t.hot && t.value > 0 ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.06)'}`,
              background: t.hot && t.value > 0 ? 'rgba(201,168,76,0.08)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{t.icon}</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: t.hot && t.value > 0 ? '#C9A84C' : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
                {t.value > 0 ? t.value : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4, lineHeight: 1.3 }}>{t.label}</div>
            </a>
          ))}
        </div>
      </div>

      {/* ── BAZ + SENDS + OPENER ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Baz */}
        <div style={{
          background: '#050508', borderRadius: 16, padding: 18,
          border: `1px solid ${bazActive ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
          boxShadow: bazActive ? '0 0 20px rgba(16,185,129,0.08)' : '0 0 20px rgba(239,68,68,0.08)',
        }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">Baz / OpenClaw</span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: bazActive ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
              color: bazActive ? '#10b981' : '#ef4444',
            }}>
              {bazActive ? 'SENDING' : 'CHECK SESSION'}
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: bazActive ? '#10b981' : '#ef4444', marginBottom: 4 }}>
            {bazActive ? '✓ Active' : '⚠ Inactive'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            Last WA: {minsAgo === null ? 'never' : minsAgo >= 60 ? `${Math.floor(minsAgo/60)}h ago` : `${minsAgo}m ago`}
          </div>
          {!bazActive && (
            <div style={{ marginTop: 8, fontSize: 10, fontFamily: 'monospace', color: 'rgba(239,68,68,0.7)', background: 'rgba(239,68,68,0.08)', borderRadius: 6, padding: '5px 8px' }}>
              ! openclaw channels login --channel whatsapp
            </div>
          )}
        </div>

        {/* Sends today */}
        {(() => {
          const sent = stats.whatsapp_today || 0
          const limit = 20
          const pct = Math.min((sent / limit) * 100, 100)
          return (
            <div style={{ background: '#050508', borderRadius: 16, padding: 18, border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-white/30 uppercase tracking-widest">Today's Sends</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>/20 limit</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#C9A84C', marginBottom: 8 }}>{sent}</div>
              <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 99, height: 6, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, transition: 'width 0.6s ease', width: `${pct}%`, background: sent >= limit ? '#10b981' : '#C9A84C' }} />
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 6 }}>
                {sent >= limit ? 'Daily limit reached ✓' : `${limit - sent} remaining`}
              </div>
            </div>
          )
        })()}

        {/* Winning opener */}
        <div style={{ background: '#050508', borderRadius: 16, padding: 18, border: '1px solid rgba(168,85,247,0.2)', boxShadow: '0 0 20px rgba(168,85,247,0.06)' }}>
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">Winning Opener</div>
          {bestVariant ? (
            <>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#a855f7' }}>{bestVariant.reply_rate?.toFixed(1)}% reply</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
                V{bestVariant.variant} · {bestVariant.sent} sent · {bestVariant.replied} replied
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 8, fontStyle: 'italic' }} className="line-clamp-2">
                "{bestVariant.preview}"
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>No data yet</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Send more to see which opener wins</div>
            </>
          )}
        </div>
      </div>

      {/* ── CHARTS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2" style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">7-Day Outreach</div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={stats.activity || []} barSize={18}>
              <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#444', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #222', borderRadius: 8 }}
                       labelStyle={{ color: '#555', fontSize: 11 }} itemStyle={{ color: '#C9A84C', fontSize: 11 }} />
              <Bar dataKey="sent" fill="#C9A84C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Pipeline Funnel</div>
          <PipelineFunnel pipeline={stats.pipeline || []} />
        </div>
      </div>

      {/* ── WINS ── */}
      {stats.converted > 0 ? (
        <div style={{ background: '#050508', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 16, padding: 20, boxShadow: '0 0 30px rgba(16,185,129,0.05)' }}>
          <div className="text-xs font-semibold text-emerald-400/60 uppercase tracking-widest mb-4">
            🏆 Paying Clients — {stats.converted}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(stats.wins || []).map((w, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.12)', borderRadius: 12, padding: '10px 14px' }}>
                <span style={{ fontSize: 20 }}>💈</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.business_name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{w.city}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>First client incoming</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Keep sending — it only takes one yes</div>
        </div>
      )}

      {/* ── YESTERDAY RECAP ── */}
      <YesterdayRecap />

      {/* ── BAZ CONVERSATIONS ── */}
      {conversations.length > 0 && (
        <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Recent Replies — Baz Conversations</div>
          <div className="space-y-3">
            {conversations.map((c, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 16 }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.8)' }}>{c.lead?.business_name || 'Unknown'}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 8 }}>{c.lead?.city}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                    {c.at ? new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {c.we_sent && (
                    <div className="flex gap-2">
                      <span style={{ fontSize: 11, color: 'rgba(201,168,76,0.6)', flexShrink: 0, width: 48, textAlign: 'right' }}>Dylan</span>
                      <div style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.55)', flex: 1 }}>{c.we_sent}</div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span style={{ fontSize: 11, color: 'rgba(59,130,246,0.6)', flexShrink: 0, width: 48, textAlign: 'right' }}>Barber</span>
                    <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.75)', flex: 1 }}>{c.barber_said}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── NOTIFICATIONS ── */}
      {stats.notifications?.length > 0 && (
        <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-semibold text-white/30 uppercase tracking-widest">
              Notifications
              {stats.unread_notifications > 0 && <span style={{ color: '#C9A84C', marginLeft: 8 }}>({stats.unread_notifications})</span>}
            </div>
            <button onClick={() => dashApi.markRead().then(() => load(true))} style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer' }}>
              Mark all read
            </button>
          </div>
          <div className="space-y-2">
            {stats.notifications.map(n => (
              <div key={n.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 10,
                background: n.read ? 'rgba(255,255,255,0.02)' : 'rgba(201,168,76,0.05)',
                border: `1px solid ${n.read ? 'rgba(255,255,255,0.04)' : 'rgba(201,168,76,0.15)'}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: n.read ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)', fontWeight: n.read ? 400 : 500 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                  {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RUN AGENTS MANUALLY ── */}
      <div style={{ background: '#050508', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 20 }}>
        <div className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-4">Run Agents Manually</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { agent: 'lead_finder',        label: 'Find Leads',      icon: '🔍' },
            { agent: 'website_analyzer',   label: 'Analyse Sites',   icon: '🔬' },
            { agent: 'preview_generator',  label: 'Gen Previews',    icon: '🌐' },
            { agent: 'whatsapp_campaign',  label: 'WhatsApp Queue',  icon: '💬' },
            { agent: 'instagram_campaign', label: 'Instagram Queue', icon: '📸' },
            { agent: 'outreach_writer',    label: 'Write Emails',    icon: '✍️' },
            { agent: 'followup_agent',     label: 'Follow-ups',      icon: '🔁' },
            { agent: 'outreach_queue',     label: 'Send Emails',     icon: '📤' },
          ].map(a => (
            <button key={a.agent} onClick={() => runAgent(a.agent)} disabled={!!running}
              className={`btn-ghost flex items-center gap-2 justify-center text-xs py-2.5 disabled:opacity-40 ${running === a.agent ? 'border-gold/40 text-gold' : ''}`}>
              <span>{a.icon}</span>
              <span>{running === a.agent ? 'Running…' : a.label}</span>
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
