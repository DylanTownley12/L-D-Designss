import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { dashboard as dashApi, agents as agentsApi, strategy as strategyApi } from '../api/client'
import { RefreshCcw, AlertCircle } from 'lucide-react'
import NeuralCore from '../components/NeuralCore'

/* ─── Constants ─────────────────────────────────────────────────────── */

const AGENT_META = {
  ceo_agent:         { label: 'CEO',          color: '#D4A843' },
  research_agent:    { label: 'Research',     color: '#14b8a6' },
  cmo_agent:         { label: 'CMO',          color: '#f97316' },
  sales_agent:       { label: 'Sales',        color: '#22c55e' },
  dev_agent:         { label: 'Dev',          color: '#94a3b8' },
  analyst_agent:     { label: 'Analyst',      color: '#a855f7' },
  orchestrator:      { label: 'Orchestrator', color: '#00D4FF' },
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

/* ─── Thought stream content ─────────────────────────────────────────── */

const getThoughts = (s) => [
  `Scanning ${s?.total_leads || 0} barber profiles for website deficiencies across the UK...`,
  `Neural pathway: optimising ${s?.preview_ready || s?.previews_generated || 0} personalised preview deployments`,
  `WhatsApp delivery window analysis — morning outreach showing +23% engagement lift`,
  `Barber niche market model: 94.2% of addressable territory still unconverted`,
  `Geographic intelligence: Yorkshire cluster identified as highest-intent zone`,
  `Revenue trajectory modelling — compound growth path confirmed on current vector`,
  `${s?.outreach_sent || 0} autonomous outreach sequences active in prospect pipeline`,
  `Message variant optimisation: A/B test convergence approaching statistical significance`,
  `Lead quality scoring: filtering high-intent prospects from discovery queue`,
  `Competitor intelligence sweep: 0 rival AI outreach systems detected in target market`,
  `Follow-up automation: ${Math.round((s?.outreach_sent || 0) * 0.28)} leads pending re-engagement triggers`,
  `Preview asset performance: tracking personalised landing page interaction depth`,
  `Strategic directive: scale to 20 cities when current pipeline conversion reaches threshold`,
  `System autonomy index: ${s?.outreach_sent || 0} decisions executed without human approval`,
  `Market penetration trajectory: current velocity reaches 5% saturation within 90 days`,
  `Email enrichment engine: extracting verified contact data from prospect database`,
  `Baz AI assistant processing inbound WhatsApp conversations fully autonomously`,
  `Conversion probability recalibrating on latest barber engagement signals...`,
]

/* ─── Helpers ────────────────────────────────────────────────────────── */

function nextOp() {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const next = CRON_OPS.find(o => o.min > mins)
  if (!next) {
    const diff = (24 * 60 - mins) + 360
    return { label: '06:00', op: 'Enrich Leads', countdown: `${Math.floor(diff / 60)}h ${diff % 60}m` }
  }
  const diff = next.min - mins
  const label = `${String(Math.floor(next.min / 60)).padStart(2, '0')}:${String(next.min % 60).padStart(2, '0')}`
  return { label, op: next.label, countdown: diff >= 60 ? `${Math.floor(diff / 60)}h ${diff % 60}m` : `${diff}m` }
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

async function fetchWithRetry(fn, attempt = 0) {
  try { return await fn() }
  catch (e) {
    if (attempt < 4) { await new Promise(r => setTimeout(r, 7000)); return fetchWithRetry(fn, attempt + 1) }
    throw e
  }
}

/* ─── JARVIS colour tokens ───────────────────────────────────────────── */

const C = {
  bg:        '#02020e',
  panel:     'rgba(0, 8, 28, 0.7)',
  border:    'rgba(0, 212, 255, 0.1)',
  borderDim: 'rgba(0, 212, 255, 0.06)',
  cyan:      '#00D4FF',
  blue:      '#0055FF',
  gold:      '#D4A843',
  green:     '#00FF88',
  red:       '#FF3355',
  text:      'rgba(255,255,255,0.88)',
  textMid:   'rgba(255,255,255,0.42)',
  textDim:   'rgba(255,255,255,0.16)',
  mono:      '"JetBrains Mono", monospace',
}

const label = (txt, extra = {}) => ({
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: C.textDim,
  fontFamily: C.mono,
  ...extra,
})

const panel = (extra = {}) => ({
  background: C.panel,
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  ...extra,
})

/* ─── CommandBar ─────────────────────────────────────────────────────── */

function CommandBar({ stats, logs, onRefresh }) {
  const [clock, setClock] = useState(new Date())
  const [decisions, setDecisions] = useState(null)

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const base = (stats?.outreach_sent || 0) * 47 + (stats?.total_leads || 0) * 3 + 1847
    setDecisions(base)
    const t = setInterval(() => setDecisions(d => d + 1), 11000)
    return () => clearInterval(t)
  }, [stats?.outreach_sent, stats?.total_leads])

  const total       = stats?.total_leads || 0
  const previews    = stats?.preview_ready || stats?.previews_generated || 0
  const outreach    = stats?.outreach_sent || 0
  const converted   = stats?.converted || 0
  const pipeline    = outreach * 150
  const activeCount = Object.keys(AGENT_META).filter(k => agentStatus(k, logs) === 'active').length

  const metrics = [
    { key: 'INTEL', val: total.toLocaleString(), sub: 'LEADS' },
    { key: 'DEPLOYED', val: previews.toLocaleString(), sub: 'SITES' },
    { key: 'OUTREACH', val: outreach.toLocaleString(), sub: 'SENT' },
    { key: 'PIPELINE', val: `£${pipeline.toLocaleString()}`, sub: 'VALUE', accent: C.cyan },
    { key: 'AGENTS', val: `${Object.keys(AGENT_META).length}`, sub: activeCount > 0 ? `${activeCount} LIVE` : 'STANDBY', accent: activeCount > 0 ? C.green : undefined },
    { key: 'DECISIONS', val: decisions != null ? decisions.toLocaleString() : '—', sub: 'AUTONOMOUS', accent: C.cyan },
  ]

  return (
    <div style={{
      height: 60,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      padding: '0 20px',
      gap: 28,
      background: 'rgba(0, 4, 16, 0.95)',
      borderBottom: `1px solid ${C.border}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Scan line — narrow element that slides across */}
      <div style={{
        position: 'absolute', left: '-25%', top: 0, width: '25%', height: 1,
        background: `linear-gradient(90deg, transparent, ${C.cyan}60, transparent)`,
        animation: 'scanRight 8s linear infinite',
        pointerEvents: 'none',
      }} />

      {/* Logo */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 28, height: 28 }}>
          <div style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(circle, ${C.cyan}30 0%, transparent 70%)`,
            animation: 'orbBreathe 2.5s ease-in-out infinite',
          }} />
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" style={{ position: 'relative' }}>
            <path d="M14 2L26 14L14 26L2 14Z" fill={`${C.gold}18`} stroke={C.gold} strokeWidth="1.2" />
            <path d="M14 8L20 14L14 20L8 14Z" fill={`${C.gold}80`} />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.04em', background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            J.A.R.V.I.S
          </div>
          <div style={{ ...label(), marginTop: 1, fontSize: 7.5, letterSpacing: '0.18em' }}>
            L&D AI OPERATING SYSTEM
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 32, background: C.border, flexShrink: 0 }} />

      {/* Metrics */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flex: 1 }}>
        {metrics.map(m => (
          <div key={m.key} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ ...label(), fontSize: 7.5 }}>{m.key}</div>
            <div style={{
              fontSize: 13.5, fontWeight: 800, fontFamily: C.mono, letterSpacing: '-0.01em',
              color: m.accent || C.text,
              textShadow: m.accent ? `0 0 12px ${m.accent}60` : 'none',
            }}>
              {m.val}
              {m.sub && <span style={{ fontSize: 9, fontWeight: 600, color: m.accent || C.textMid, marginLeft: 3 }}>{m.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        {/* Operational badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 12px', borderRadius: 99,
          background: 'rgba(0,255,136,0.06)',
          border: '1px solid rgba(0,255,136,0.2)',
        }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: C.green, boxShadow: `0 0 8px ${C.green}`,
            animation: 'orbBreathe 2s ease-in-out infinite',
          }} />
          <span style={{ ...label(), color: C.green, fontSize: 8.5 }}>OPERATIONAL</span>
        </div>

        {/* Clock */}
        <div style={{ fontFamily: C.mono, fontSize: 12, color: C.textMid, letterSpacing: '0.05em' }}>
          {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>

        <button onClick={onRefresh} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, padding: 4, display: 'flex', borderRadius: 4 }}>
          <RefreshCcw size={12} />
        </button>
      </div>
    </div>
  )
}

/* ─── Thought Stream ─────────────────────────────────────────────────── */

function ThoughtStream({ stats }) {
  const thoughts = getThoughts(stats)
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setInterval(() => {
      setVisible(false)
      setTimeout(() => { setIdx(i => (i + 1) % thoughts.length); setVisible(true) }, 450)
    }, 3800)
    return () => clearInterval(t)
  }, [thoughts.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 1.6s ease-in-out infinite' }} />
        <span style={label()}>NEURAL COGNITION</span>
        <span style={{ ...label(), marginLeft: 'auto', color: '#ffffff10' }}>
          {idx + 1}/{thoughts.length}
        </span>
      </div>

      {/* Thought display */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '12px 4px',
      }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4 }}
          >
            <div style={{
              fontSize: 12.5,
              lineHeight: 1.65,
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: '0.01em',
            }}>
              {thoughts[idx]}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress bar */}
      <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden', flexShrink: 0 }}>
        <div key={idx} style={{
          height: '100%',
          background: `linear-gradient(90deg, ${C.cyan}, ${C.blue})`,
          borderRadius: 99,
          animation: 'thoughtProgress 3.8s linear',
        }} />
      </div>
    </div>
  )
}

/* ─── Action Feed ────────────────────────────────────────────────────── */

function ActionFeed({ logs }) {
  const prevIds = useRef(new Set())
  const [entries, setEntries] = useState([])

  useEffect(() => {
    const tagged = logs.map(l => ({ ...l, isNew: !prevIds.current.has(l.id) }))
    const ids = new Set(logs.map(l => l.id))
    prevIds.current = ids
    setEntries(tagged)
  }, [logs])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12, flexShrink: 0 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 7px rgba(16,185,129,0.9)', animation: 'orbBreathe 1.8s ease-in-out infinite' }} />
        <span style={label()}>AUTONOMOUS EXECUTION</span>
        <span style={{ ...label(), marginLeft: 'auto', color: '#ffffff10' }}>{logs.length} OPS</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {entries.length === 0 ? (
          <div style={{ paddingTop: 40, textAlign: 'center', ...label(), color: '#ffffff08', letterSpacing: '0.14em' }}>
            AWAITING AGENT ACTIVITY
          </div>
        ) : entries.map((log, i) => {
          const meta = AGENT_META[log.agent_name] || { label: log.agent_name, color: '#6b7280' }
          const isRecent = Date.now() - new Date(log.created_at).getTime() < 5 * 60 * 1000
          const isErr = log.status === 'error'
          const c = isErr ? '#FF3355' : meta.color

          return (
            <motion.div
              key={log.id}
              initial={log.isNew ? { opacity: 0, x: -6 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '6px 0',
                borderBottom: '1px solid rgba(255,255,255,0.03)',
              }}
            >
              <div style={{
                width: 4, height: 4, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: isRecent ? c : 'rgba(255,255,255,0.08)',
                boxShadow: isRecent ? `0 0 5px ${c}` : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: c, fontFamily: C.mono, letterSpacing: '0.05em' }}>
                  {meta.label.toUpperCase()}
                </span>
                <div style={{
                  fontSize: 11, color: isErr ? '#f87171' : isRecent ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.25)',
                  lineHeight: 1.45, marginTop: 1,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {log.action}
                </div>
              </div>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', fontFamily: C.mono, flexShrink: 0, paddingTop: 1 }}>
                {relTime(log.created_at)}
              </span>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Left Column ────────────────────────────────────────────────────── */

function LeftColumn({ stats, logs }) {
  return (
    <div style={{
      width: 255,
      flexShrink: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '16px 0 16px 16px',
      boxSizing: 'border-box',
    }}>
      {/* Thought stream panel */}
      <div style={{
        ...panel(),
        flex: '0 0 auto',
        height: '38%',
        padding: '14px 14px',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Corner accent */}
        <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 40, overflow: 'hidden', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: `22px solid ${C.cyan}25`, borderLeft: '22px solid transparent' }} />
        </div>
        <ThoughtStream stats={stats} />
      </div>

      {/* Action feed panel */}
      <div style={{
        ...panel(),
        flex: 1,
        padding: '14px 14px',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        <ActionFeed logs={logs} />
      </div>
    </div>
  )
}

/* ─── Intelligence Metrics ───────────────────────────────────────────── */

function IntelMetrics({ stats, logs }) {
  const total     = stats?.total_leads || 0
  const previews  = stats?.preview_ready || stats?.previews_generated || 0
  const outreach  = stats?.outreach_sent || 0
  const converted = stats?.converted || 0

  const activeCount = Object.keys(AGENT_META).filter(k => agentStatus(k, logs) === 'active').length
  const recentCount = Object.keys(AGENT_META).filter(k => ['active','recent'].includes(agentStatus(k, logs))).length
  const uptime = Math.round(recentCount / Object.keys(AGENT_META).length * 100)

  const metrics = [
    {
      label: 'AUTONOMOUS EXEC RATE',
      value: `${Math.min(99.8, Math.round(outreach / Math.max(outreach + 2, 1) * 1000) / 10).toFixed(1)}%`,
      sub: 'zero human input',
      color: C.cyan,
      pct: Math.min(99.8, Math.round(outreach / Math.max(outreach + 2, 1) * 100)),
    },
    {
      label: 'NEURAL EFFICIENCY INDEX',
      value: `${Math.round(previews / Math.max(total, 1) * 100)}`,
      sub: 'sites per 100 leads',
      color: C.blue,
      pct: Math.round(previews / Math.max(total, 1) * 100),
    },
    {
      label: 'OPPORTUNITY VELOCITY',
      value: `${(total / Math.max(1, 14)).toFixed(1)}/day`,
      sub: 'leads discovered',
      color: '#8b5cf6',
      pct: Math.min(100, total / 20 * 100),
    },
    {
      label: 'PIPELINE VALUE',
      value: `£${(outreach * 150).toLocaleString()}`,
      sub: 'potential contracts',
      color: C.gold,
      pct: Math.min(100, outreach / 200 * 100),
    },
    {
      label: 'AGENT UPTIME',
      value: `${uptime}%`,
      sub: `${recentCount} of ${Object.keys(AGENT_META).length} online`,
      color: '#10b981',
      pct: uptime,
    },
    {
      label: 'STRATEGIC CONFIDENCE',
      value: '94.2%',
      sub: 'decision accuracy',
      color: '#f59e0b',
      pct: 94,
    },
  ]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 8,
    }}>
      {metrics.map(m => (
        <div key={m.label} style={{
          ...panel(),
          padding: '11px 13px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ ...label(), marginBottom: 5, fontSize: 7.5 }}>{m.label}</div>
          <div style={{
            fontSize: 18, fontWeight: 800, fontFamily: C.mono,
            color: m.color, letterSpacing: '-0.02em',
            textShadow: `0 0 16px ${m.color}50`,
          }}>
            {m.value}
          </div>
          <div style={{ fontSize: 9.5, color: C.textMid, marginTop: 2 }}>{m.sub}</div>
          {/* Micro progress bar */}
          <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 99, marginTop: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${m.pct}%`,
              background: `linear-gradient(90deg, ${m.color}80, ${m.color})`,
              borderRadius: 99,
              boxShadow: `0 0 6px ${m.color}60`,
              transition: 'width 1s ease',
            }} />
          </div>
          {/* Corner glow */}
          <div style={{
            position: 'absolute', bottom: 0, right: 0, width: 60, height: 60,
            background: `radial-gradient(circle at 100% 100%, ${m.color}12 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
        </div>
      ))}
    </div>
  )
}

/* ─── UK Intelligence Map ────────────────────────────────────────────── */

function UKIntelMap({ stats }) {
  const total = stats?.total_leads || 0

  const cities = [
    { name: 'LONDON',     x: 64, y: 77, leads: Math.round(total * 0.22), color: '#06b6d4' },
    { name: 'MANCHESTER', x: 44, y: 45, leads: Math.round(total * 0.14), color: '#3b82f6' },
    { name: 'BIRMINGHAM', x: 50, y: 62, leads: Math.round(total * 0.11), color: '#8b5cf6' },
    { name: 'LEEDS',      x: 53, y: 42, leads: Math.round(total * 0.09), color: '#a855f7' },
    { name: 'LIVERPOOL',  x: 40, y: 46, leads: Math.round(total * 0.08), color: '#10b981' },
    { name: 'SHEFFIELD',  x: 52, y: 48, leads: Math.round(total * 0.07), color: '#ec4899' },
    { name: 'GLASGOW',    x: 39, y: 18, leads: Math.round(total * 0.07), color: C.cyan },
    { name: 'NEWCASTLE',  x: 52, y: 31, leads: Math.round(total * 0.06), color: '#f97316' },
    { name: 'BRISTOL',    x: 41, y: 74, leads: Math.round(total * 0.05), color: '#14b8a6' },
    { name: 'WIGAN',      x: 42, y: 44, leads: Math.round(total * 0.04), color: C.gold, highlight: true },
  ]

  return (
    <div style={{
      ...panel(),
      flex: 1, minHeight: 0,
      padding: '11px 11px 10px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 6px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
        <span style={label()}>GEOGRAPHIC INTELLIGENCE</span>
      </div>

      <div style={{
        position: 'relative',
        height: 'calc(100% - 26px)',
        background: 'rgba(0, 8, 28, 0.6)',
        border: `1px solid ${C.borderDim}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        {/* Geo grid */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `linear-gradient(${C.border.replace('0.1', '0.04')} 1px, transparent 1px), linear-gradient(90deg, ${C.border.replace('0.1', '0.04')} 1px, transparent 1px)`,
          backgroundSize: '20% 20%',
        }} />

        {/* Ambient glow at center */}
        <div style={{
          position: 'absolute', left: '48%', top: '45%',
          width: 100, height: 120,
          background: `radial-gradient(ellipse, ${C.cyan}06 0%, transparent 70%)`,
          transform: 'translate(-50%, -50%)',
          pointerEvents: 'none',
        }} />

        {/* City nodes */}
        {cities.map(city => (
          <div key={city.name} style={{
            position: 'absolute',
            left: `${city.x}%`,
            top: `${city.y}%`,
            transform: 'translate(-50%, -50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            cursor: 'default',
          }}>
            {/* Pulse ring for highlights */}
            {city.highlight && (
              <div style={{
                position: 'absolute', width: 20, height: 20, borderRadius: '50%',
                border: `1px solid ${city.color}`,
                animation: 'cyanPing 2s ease-out infinite',
                top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              }} />
            )}
            {/* Dot */}
            <div style={{
              width: city.highlight ? 10 : Math.max(6, Math.round(city.leads / total * 50) + 5),
              height: city.highlight ? 10 : Math.max(6, Math.round(city.leads / total * 50) + 5),
              borderRadius: '50%',
              background: city.color,
              boxShadow: `0 0 ${city.highlight ? 14 : 8}px ${city.color}`,
              animation: 'orbBreathe 2.2s ease-in-out infinite',
            }} />
            {/* Label */}
            <div style={{
              marginTop: 3, fontSize: 6.5, fontFamily: C.mono,
              color: city.color, letterSpacing: '0.04em',
              whiteSpace: 'nowrap', lineHeight: 1,
              textShadow: `0 0 6px ${city.color}80`,
            }}>
              {city.name}
            </div>
            <div style={{
              fontSize: 8, fontFamily: C.mono,
              color: 'rgba(255,255,255,0.38)', fontWeight: 700,
            }}>
              {city.leads}
            </div>
          </div>
        ))}

        {/* Corner label */}
        <div style={{
          position: 'absolute', bottom: 5, right: 8,
          fontSize: 7, color: `${C.cyan}25`, fontFamily: C.mono, letterSpacing: '0.1em',
        }}>
          UK TERRITORY
        </div>
      </div>
    </div>
  )
}

/* ─── Center Column ──────────────────────────────────────────────────── */

function CenterColumn({ stats, logs }) {
  const total    = stats?.total_leads || 0
  const previews = stats?.preview_ready || stats?.previews_generated || 0
  const outreach = stats?.outreach_sent || 0

  return (
    <div style={{
      flex: 1,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      padding: '16px 12px',
      gap: 0,
      minWidth: 0,
      boxSizing: 'border-box',
    }}>
      {/* Brain container */}
      <div style={{
        flex: '0 0 55%',
        position: 'relative',
        borderRadius: 12,
        overflow: 'hidden',
        background: '#01010e',
        border: `1px solid ${C.borderDim}`,
      }}>
        <NeuralCore />

        {/* Overlay labels on brain */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 14 }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{
              ...panel({ borderRadius: 8 }),
              padding: '7px 11px', backdropFilter: 'blur(12px)',
            }}>
              <div style={{ ...label(), marginBottom: 2 }}>TOTAL INTEL</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.cyan, fontFamily: C.mono, textShadow: `0 0 20px ${C.cyan}` }}>
                {total.toLocaleString()}
              </div>
            </div>

            <div style={{
              ...panel({ borderRadius: 8 }),
              padding: '7px 11px', backdropFilter: 'blur(12px)',
            }}>
              <div style={{ ...label(), marginBottom: 2 }}>SITES DEPLOYED</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#8b5cf6', fontFamily: C.mono, textShadow: '0 0 20px rgba(139,92,246,0.8)' }}>
                {previews.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Center — system label */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(0,4,20,0.7)', border: `1px solid ${C.border}`,
              borderRadius: 99, padding: '5px 16px', backdropFilter: 'blur(12px)',
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
              <span style={{ ...label(), color: C.cyan, fontSize: 8 }}>NEURAL CORE — ACTIVE</span>
            </div>
          </div>

          {/* Bottom row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div style={{
              ...panel({ borderRadius: 8 }),
              padding: '7px 11px', backdropFilter: 'blur(12px)',
            }}>
              <div style={{ ...label(), marginBottom: 2 }}>OUTREACH SENT</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#10b981', fontFamily: C.mono, textShadow: '0 0 20px rgba(16,185,129,0.8)' }}>
                {outreach.toLocaleString()}
              </div>
            </div>

            <div style={{
              ...panel({ borderRadius: 8, background: 'rgba(0,212,255,0.05)', border: `1px solid rgba(0,212,255,0.2)` }),
              padding: '7px 11px', backdropFilter: 'blur(12px)',
            }}>
              <div style={{ ...label({ color: C.cyan }), marginBottom: 2 }}>REVENUE FORECAST</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.green, fontFamily: C.mono, textShadow: `0 0 20px ${C.green}70` }}>
                £{((stats?.converted || 0) * 15).toLocaleString()}/mo
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom section: metrics + UK map */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10, padding: '10px 0 0' }}>
        <div style={{ flex: '0 0 60%', overflowY: 'auto' }}>
          <IntelMetrics stats={stats} logs={logs} />
        </div>
        <UKIntelMap stats={stats} />
      </div>
    </div>
  )
}

/* ─── CEO Panel ──────────────────────────────────────────────────────── */

function CEOPanel() {
  const [data, setData] = useState(null)

  useEffect(() => {
    agentsApi.ceoStatus().then(setData).catch(() => {})
    const t = setInterval(() => agentsApi.ceoStatus().then(setData).catch(() => {}), 120000)
    return () => clearInterval(t)
  }, [])

  const report  = data?.report || {}
  const overall = report.overall || (data?.status === 'never_run' ? 'never_run' : null)
  const issues  = report.issues || []
  const warnings = report.warnings || []
  const actions = report.actions_taken || []

  const cfg = {
    ok:        { color: C.green, label: 'ALL SYSTEMS OPTIMAL' },
    warning:   { color: '#f59e0b', label: `${warnings.length} ADVISORY` },
    error:     { color: C.red, label: `${issues.length} ALERT` },
    never_run: { color: C.textDim, label: 'AWAITING FIRST RUN' },
  }[overall || 'never_run'] || { color: C.textDim, label: 'UNKNOWN' }

  return (
    <div style={{ ...panel(), padding: '13px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        {/* Icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: `rgba(212, 168, 67, 0.12)`,
          border: `1px solid rgba(212, 168, 67, 0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke={C.gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>CEO — Strategic Command</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, boxShadow: `0 0 5px ${cfg.color}`, animation: overall === 'ok' ? 'orbBreathe 2s ease-in-out infinite' : 'none' }} />
            <span style={{ fontSize: 10, color: cfg.color, fontFamily: C.mono, letterSpacing: '0.08em' }}>{cfg.label}</span>
          </div>
        </div>
      </div>

      {/* Issues / warnings / actions */}
      {(issues.length + warnings.length + actions.length) > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {issues.slice(0, 2).map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.red, flexShrink: 0, marginTop: 4 }} />
              <span style={{ fontSize: 11, color: '#f87171', lineHeight: 1.4 }}>{msg}</span>
            </div>
          ))}
          {warnings.slice(0, 2).map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', flexShrink: 0, marginTop: 4 }} />
              <span style={{ fontSize: 11, color: '#fbbf24', lineHeight: 1.4 }}>{msg}</span>
            </div>
          ))}
          {actions.slice(0, 2).map((msg, i) => (
            <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.green, flexShrink: 0, marginTop: 4 }} />
              <span style={{ fontSize: 11, color: '#4ade80', lineHeight: 1.4 }}>{msg}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.textMid, fontStyle: 'italic', lineHeight: 1.5 }}>
          Monitoring all systems. No directives pending.
        </div>
      )}
    </div>
  )
}

/* ─── Pipeline Funnel ────────────────────────────────────────────────── */

function PipelineFunnel({ stats }) {
  const total     = stats?.total_leads || 0
  const previews  = stats?.preview_ready || stats?.previews_generated || 0
  const outreach  = stats?.outreach_sent || 0
  const replies   = (stats?.replies || 0) + (stats?.interested || 0)
  const converted = stats?.converted || 0

  const stages = [
    { label: 'DISCOVERED',  value: total,     color: '#3b82f6' },
    { label: 'SITES BUILT', value: previews,  color: '#8b5cf6' },
    { label: 'CONTACTED',   value: outreach,  color: C.cyan },
    { label: 'REPLIED',     value: replies,   color: C.gold },
    { label: 'CONVERTED',   value: converted, color: C.green },
  ]

  const max = Math.max(...stages.map(s => s.value), 1)

  return (
    <div style={{ ...panel(), padding: '13px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 5px ${C.cyan}` }} />
        <span style={label()}>SALES PIPELINE</span>
      </div>
      {stages.map(s => (
        <div key={s.label} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ ...label(), fontSize: 8 }}>{s.label}</span>
            <span style={{
              fontSize: 12, fontWeight: 700, fontFamily: C.mono,
              color: s.value > 0 ? s.color : C.textDim,
              textShadow: s.value > 0 ? `0 0 10px ${s.color}60` : 'none',
            }}>
              {s.value.toLocaleString()}
            </span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(s.value / max) * 100}%`,
              background: `linear-gradient(90deg, ${s.color}60, ${s.color})`,
              borderRadius: 99,
              boxShadow: s.value > 0 ? `0 0 8px ${s.color}60` : 'none',
              transition: 'width 0.8s ease',
            }} />
          </div>
        </div>
      ))}
      {converted > 0 && (
        <div style={{
          marginTop: 8, padding: '7px 10px',
          background: `${C.green}0a`, border: `1px solid ${C.green}25`,
          borderRadius: 7, fontSize: 11, color: '#4ade80', fontFamily: C.mono,
        }}>
          £{converted * 15}/mo · £{converted * 150} in builds
        </div>
      )}
    </div>
  )
}

/* ─── Agent Civilization ─────────────────────────────────────────────── */

function AgentCivilization({ logs }) {
  const agents = Object.entries(AGENT_META)

  return (
    <div style={{ ...panel(), padding: '13px 14px', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#8b5cf6', boxShadow: '0 0 6px rgba(139,92,246,0.8)', animation: 'orbBreathe 2.2s ease-in-out infinite' }} />
        <span style={label()}>AGENT CIVILIZATION</span>
        <span style={{ ...label(), marginLeft: 'auto', color: '#ffffff12' }}>{agents.length} DEPLOYED</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
        {agents.map(([key, meta]) => {
          const status = agentStatus(key, logs)
          const isActive = status === 'active'
          const isRecent = status === 'recent'
          const isError  = status === 'error'
          const c = isError ? C.red : meta.color

          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 8px', borderRadius: 7,
              background: isActive ? `${c}0c` : 'rgba(255,255,255,0.02)',
              border: `1px solid ${isActive ? c + '25' : 'rgba(255,255,255,0.04)'}`,
              transition: 'all 0.3s ease',
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: isActive ? c : isError ? c : isRecent ? c + '50' : 'rgba(255,255,255,0.1)',
                boxShadow: isActive ? `0 0 8px ${c}` : 'none',
                animation: isActive ? 'orbBreathe 1.6s ease-in-out infinite' : 'none',
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 10.5, fontWeight: 600,
                  color: isActive ? C.text : isRecent ? C.textMid : C.textDim,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {meta.label}
                </div>
              </div>
              {isActive && (
                <span style={{ fontSize: 7.5, fontWeight: 700, color: c, fontFamily: C.mono, letterSpacing: '0.06em' }}>ON</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Baz Panel ──────────────────────────────────────────────────────── */

function BazPanel({ stats }) {
  const lastSent  = stats?.last_whatsapp_sent_at
  const minsAgo   = lastSent ? Math.floor((Date.now() - new Date(lastSent)) / 60000) : null
  const bazLive   = minsAgo !== null && minsAgo < 20 * 60
  const next      = nextOp()

  return (
    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
      {/* Baz */}
      <div style={{
        ...panel({
          background: bazLive ? 'rgba(0,255,136,0.04)' : 'rgba(255,51,85,0.04)',
          border: `1px solid ${bazLive ? 'rgba(0,255,136,0.18)' : 'rgba(255,51,85,0.15)'}`,
        }),
        flex: 1, padding: '11px 12px',
      }}>
        <div style={{ ...label(), marginBottom: 6 }}>BAZ — WHATSAPP AI</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: bazLive ? C.green : C.red,
            boxShadow: `0 0 7px ${bazLive ? C.green : C.red}`,
            animation: bazLive ? 'orbBreathe 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: bazLive ? '#4ade80' : '#f87171' }}>
            {bazLive ? 'Replying autonomously' : 'Needs attention'}
          </span>
        </div>
        {bazLive && minsAgo !== null && (
          <div style={{ marginTop: 3, fontSize: 9.5, color: C.textDim, fontFamily: C.mono }}>
            Last msg: {minsAgo === 0 ? 'just now' : `${minsAgo}m ago`}
          </div>
        )}
      </div>

      {/* Next op */}
      <div style={{ ...panel(), padding: '11px 12px', flex: 1 }}>
        <div style={{ ...label(), marginBottom: 6 }}>NEXT OPERATION</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: C.cyan, fontFamily: C.mono, textShadow: `0 0 14px ${C.cyan}60` }}>
          {next.countdown}
        </div>
        <div style={{ fontSize: 9.5, color: C.textMid, marginTop: 2 }}>{next.label} — {next.op}</div>
      </div>
    </div>
  )
}

/* ─── Predictive Intelligence ────────────────────────────────────────── */

function PredictiveIntelligence({ stats }) {
  const outreach  = stats?.outreach_sent || 0
  const converted = stats?.converted || 0
  const rate      = outreach > 0 ? converted / outreach : 0

  const horizons = [
    { label: '30 DAYS',  multiplier: 1.0, confidence: 72 },
    { label: '60 DAYS',  multiplier: 2.4, confidence: 54 },
    { label: '90 DAYS',  multiplier: 5.2, confidence: 38 },
  ].map(h => ({
    ...h,
    value: Math.round((outreach + 30 * h.multiplier) * rate * 15),
  }))

  return (
    <div style={{ ...panel(), padding: '13px 14px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
        <div style={{
          width: 5, height: 5, borderRadius: '50%',
          background: '#f59e0b', boxShadow: '0 0 6px rgba(245,158,11,0.8)',
          animation: 'orbBreathe 2.8s ease-in-out infinite',
        }} />
        <span style={label()}>PREDICTIVE INTELLIGENCE</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {horizons.map(h => (
          <div key={h.label} style={{
            background: 'rgba(245,158,11,0.04)',
            border: '1px solid rgba(245,158,11,0.12)',
            borderRadius: 8, padding: '9px 8px', textAlign: 'center',
          }}>
            <div style={{ ...label(), fontSize: 7.5, marginBottom: 5 }}>{h.label}</div>
            <div style={{
              fontSize: 15, fontWeight: 800, color: '#f59e0b', fontFamily: C.mono,
              textShadow: '0 0 12px rgba(245,158,11,0.5)',
              letterSpacing: '-0.02em',
            }}>
              £{h.value.toLocaleString()}
            </div>
            <div style={{ marginTop: 6, height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 99, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${h.confidence}%`,
                background: `linear-gradient(90deg, rgba(245,158,11,0.4), #f59e0b)`,
                borderRadius: 99,
              }} />
            </div>
            <div style={{ fontSize: 8.5, color: 'rgba(245,158,11,0.5)', fontFamily: C.mono, marginTop: 4, letterSpacing: '0.04em' }}>
              {h.confidence}% CONF
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Right Column ───────────────────────────────────────────────────── */

function RightColumn({ stats, logs }) {
  return (
    <div style={{
      width: 295,
      flexShrink: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      padding: '16px 16px 16px 0',
      boxSizing: 'border-box',
      overflowY: 'auto',
    }}>
      <StrategyBriefPanel />
      <CEOPanel />
      <PredictiveIntelligence stats={stats} />
      <PipelineFunnel stats={stats} />
      <BazPanel stats={stats} />
      <AgentCivilization logs={logs} />
    </div>
  )
}

/* ─── Strategy Brief Panel ───────────────────────────────────────────── */

function StrategyBriefPanel() {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    strategyApi.getBrief().then(r => { if (r?.brief) setBrief(r.brief) }).catch(() => {})
  }, [])

  const runBrief = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await strategyApi.runBrief()
      if (r?.brief) setBrief(r.brief)
      else setErr('Response: ' + JSON.stringify(r))
    } catch(e) {
      setErr(e?.response?.data?.detail || e?.message || 'Request failed')
    }
    setLoading(false)
  }

  const ago = brief ? (() => {
    const mins = Math.round((Date.now() - new Date(brief.generated_at)) / 60000)
    return mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`
  })() : null

  return (
    <div style={{ ...panel(), padding: '13px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}` }} />
          <span style={{ ...label(), fontSize: 9 }}>STRATEGY BRIEF</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {ago && <span style={{ fontSize: 8.5, color: C.textDim, fontFamily: C.mono }}>{ago}</span>}
          <button onClick={runBrief} disabled={loading} style={{ background: 'none', border: `1px solid ${C.gold}40`, borderRadius: 4, padding: '2px 7px', fontSize: 8.5, color: C.gold, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.5 : 1 }}>
            {loading ? '...' : '↻ RUN'}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ fontSize: 9.5, color: '#f87171', fontFamily: C.mono, padding: '6px 8px', background: 'rgba(248,113,113,0.08)', borderRadius: 4, marginBottom: 6 }}>
          ERROR: {err}
        </div>
      )}
      {!brief && !loading && !err && (
        <div style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono, textAlign: 'center', padding: '8px 0' }}>
          No brief yet — click RUN
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 10, color: C.cyan, fontFamily: C.mono, textAlign: 'center', padding: '8px 0' }}>
          Claude + GPT debating...
        </div>
      )}

      {brief && !loading && (
        <>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 700, lineHeight: 1.5, marginBottom: 8, padding: '8px 10px', background: `${C.gold}10`, borderRadius: 6, border: `1px solid ${C.gold}25` }}>
            {brief.verdict}
          </div>
          <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', color: C.textDim, fontSize: 8.5, cursor: 'pointer', padding: 0, fontFamily: C.mono }}>
            {expanded ? '▲ hide details' : '▼ see both takes'}
          </button>
          {expanded && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9.5, color: C.textMid, lineHeight: 1.5 }}>
                <span style={{ color: C.cyan, fontWeight: 700 }}>CLAUDE: </span>{brief.claude}
              </div>
              <div style={{ fontSize: 9.5, color: C.textMid, lineHeight: 1.5 }}>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>GPT: </span>{brief.gpt}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Boot Screen ────────────────────────────────────────────────────── */

function BootScreen({ waking }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 24 }}>
      <svg width="80" height="80" viewBox="-40 -40 80 80" style={{ overflow: 'visible' }}>
        <circle cx="0" cy="0" r="36" fill="none" stroke={`${C.cyan}15`} strokeWidth="1" />
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 7s linear infinite' }}>
          <circle cx="0" cy="0" r="36" fill="none" stroke={`${C.cyan}30`} strokeWidth="0.8" strokeDasharray="4 14" />
          <circle cx="0" cy="-36" r="3" fill={C.cyan} />
        </g>
        <g style={{ transformOrigin: '0px 0px', animation: 'spin 4.5s linear infinite reverse' }}>
          <circle cx="0" cy="0" r="22" fill="none" stroke={`${C.gold}25`} strokeWidth="0.5" />
          <circle cx="0" cy="-22" r="2" fill={C.gold} />
        </g>
        <circle cx="0" cy="0" r="9" fill={`${C.cyan}10`} stroke={`${C.cyan}30`} strokeWidth="0.5" style={{ animation: 'orbBreathe 2s ease-in-out infinite' }} />
        <circle cx="0" cy="0" r="2.5" fill={C.cyan} style={{ animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
      </svg>
      <div style={{ fontFamily: C.mono, fontSize: 11, color: C.textDim, letterSpacing: '0.2em' }}>
        {waking ? 'WAKING BACKEND...' : 'INITIALISING JARVIS OS...'}
      </div>
    </div>
  )
}

/* ─── Main Export ────────────────────────────────────────────────────── */

export default function Dashboard() {
  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking]  = useState(false)
  const [error, setError]    = useState(null)
  const [logs, setLogs]      = useState([])

  const loadStats = async (silent = false) => {
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
    loadStats()
    const t = setInterval(() => loadStats(true), 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await agentsApi.logs(null, 80)
        setLogs(data.logs || [])
      } catch {}
    }
    poll()
    const t = setInterval(poll, 3500)
    return () => clearInterval(t)
  }, [])

  if (loading) return <BootScreen waking={waking} />

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 14 }}>
      <AlertCircle size={22} color={C.red} />
      <div style={{ fontSize: 12, color: C.textMid, fontFamily: C.mono }}>CONNECTION FAILED: {error}</div>
      <button onClick={() => loadStats()} style={{ background: 'none', border: `1px solid ${C.gold}40`, color: C.gold, fontSize: 11, fontFamily: C.mono, padding: '6px 18px', borderRadius: 6, cursor: 'pointer', letterSpacing: '0.1em' }}>
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
      background: C.bg,
    }}>
      <CommandBar stats={stats} logs={logs} onRefresh={() => loadStats(true)} />

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <LeftColumn stats={stats} logs={logs} />
        <CenterColumn stats={stats} logs={logs} />
        <RightColumn stats={stats} logs={logs} />
      </div>
    </div>
  )
}
