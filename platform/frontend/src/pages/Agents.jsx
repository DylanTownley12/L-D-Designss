import { useState, useEffect, useRef } from 'react'
import { agents as agentsApi, outreach as outreachApi } from '../api/client'
import {
  Crown, Map, Megaphone, Briefcase, Code2, BarChart2, Network,
  Search, ScanSearch, Palette, Gem, Mail, RotateCcw,
  Play, RefreshCcw, AlertCircle, CheckCircle2, Activity,
  ChevronDown, Zap, MessageSquare, Send, X, Brain,
} from 'lucide-react'

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
const label = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panel = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...extra })

const AGENT_META = {
  ceo_agent:         { Icon: Crown,      label: 'CEO Agent',         role: 'Commanding Officer',   color: '#D4A843', desc: 'System health + auto-fix every 2h' },
  research_agent:    { Icon: Map,        label: 'Research',          role: 'Intelligence Officer', color: '#14b8a6', desc: 'City & opportunity intelligence' },
  cmo_agent:         { Icon: Megaphone,  label: 'CMO',               role: 'Marketing Commander',  color: '#f97316', desc: 'Reply rates, trends & strategy' },
  sales_agent:       { Icon: Briefcase,  label: 'Sales',             role: 'Sales Operative',      color: '#22c55e', desc: 'Closes interested leads' },
  dev_agent:         { Icon: Code2,      label: 'Developer',         role: 'Systems Engineer',     color: '#94a3b8', desc: 'Error patterns & missed jobs' },
  analyst_agent:     { Icon: BarChart2,  label: 'Analyst',           role: 'Data Analyst',         color: '#a855f7', desc: 'Funnel stats & city performance' },
  orchestrator:      { Icon: Network,    label: 'Orchestrator',      role: 'Mission Coordinator',  color: '#D4A843', desc: 'Decides what runs and when' },
  lead_finder:       { Icon: Search,     label: 'Lead Finder',       role: 'Field Scout',          color: '#3b82f6', desc: 'Finds barbers with no website' },
  website_analyzer:  { Icon: ScanSearch, label: 'Site Analyzer',     role: 'Site Intelligence',    color: '#8b5cf6', desc: 'Checks quality + contact info' },
  preview_generator: { Icon: Palette,    label: 'Preview Builder',   role: 'Asset Creator',        color: '#06b6d4', desc: 'Builds free preview websites' },
  lead_enricher:     { Icon: Gem,        label: 'Lead Enricher',     role: 'Intel Gatherer',       color: '#ec4899', desc: 'Finds emails + Instagram handles' },
  outreach_writer:   { Icon: Mail,       label: 'Outreach Writer',   role: 'Comms Operative',      color: '#10b981', desc: 'Writes WhatsApp & email messages' },
  followup_agent:    { Icon: RotateCcw,  label: 'Follow-up',         role: 'Retention Operative',  color: '#f59e0b', desc: 'Sends 48hr follow-ups' },
}

const TASK_OPTIONS = [
  { value: 'auto',              label: 'Auto — run what\'s needed' },
  { value: 'find_leads',        label: 'Scout new leads' },
  { value: 'generate_previews', label: 'Build preview sites' },
  { value: 'send_outreach',     label: 'Deploy WhatsApp campaign' },
  { value: 'followup',          label: 'Send follow-ups' },
]

function relTime(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 8000) return 'just now'
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

/* ── Agent Roster Row ── */
function AgentRow({ name, status, lastAction, lastTime, isFirst, onChat }) {
  const meta = AGENT_META[name] || { Icon: Activity, label: name, role: '', color: '#6b7280', desc: '' }
  const { Icon } = meta
  const c = meta.color

  const isRunning = status === 'running'
  const isDone    = status === 'done'
  const isError   = status === 'error'
  const isActive  = isRunning || isDone

  const statusDot = isRunning ? '#10b981' : isError ? '#ef4444' : isDone ? '#10b981' : 'rgba(255,255,255,0.1)'
  const statusPulse = isRunning

  const rowBg = isRunning
    ? `linear-gradient(90deg, ${c}0e 0%, transparent 100%)`
    : 'transparent'

  return (
    <div
      onClick={() => onChat(name)}
      style={{
        display: 'grid',
        gridTemplateColumns: '32px 1fr auto auto auto',
        gap: 14,
        alignItems: 'center',
        padding: '9px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        background: rowBg,
        transition: 'all 0.2s ease',
        borderLeft: isRunning ? `2px solid ${c}60` : '2px solid transparent',
        cursor: 'pointer',
      }}
      onMouseEnter={e => e.currentTarget.style.background = isRunning ? rowBg : `rgba(255,255,255,0.025)`}
      onMouseLeave={e => e.currentTarget.style.background = rowBg}
    >

      {/* Icon */}
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: isActive ? c + '18' : 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: isRunning ? `0 0 10px ${c}30` : 'none',
      }}>
        <Icon size={14} color={isActive ? c : 'rgba(255,255,255,0.22)'} />
      </div>

      {/* Name + role + last action */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.55)' }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
            {meta.role}
          </span>
        </div>
        {lastAction ? (
          <div style={{
            fontSize: 10.5, color: isRunning ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.22)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {lastAction}
          </div>
        ) : (
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.12)', fontFamily: '"JetBrains Mono", monospace' }}>
            {meta.desc}
          </div>
        )}
      </div>

      {/* Time */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {lastTime && (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace' }}>
            {relTime(lastTime)}
          </span>
        )}
      </div>

      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, minWidth: 72, justifyContent: 'flex-end' }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: statusDot,
          boxShadow: statusPulse ? `0 0 7px ${statusDot}` : 'none',
          animation: statusPulse ? 'orbBreathe 1.5s ease-in-out infinite' : 'none',
        }} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          fontFamily: '"JetBrains Mono", monospace',
          color: isRunning ? '#10b981' : isError ? '#ef4444' : isDone ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)',
        }}>
          {isRunning ? 'RUNNING' : isError ? 'ERROR' : isDone ? 'DONE' : 'STANDBY'}
        </span>
      </div>

      {/* Chat icon */}
      <div style={{ flexShrink: 0, opacity: 0.25 }}>
        <MessageSquare size={12} color={c} />
      </div>
    </div>
  )
}

/* ── Log Line ── */
function LogLine({ log }) {
  const meta = AGENT_META[log.agent_name] || { Icon: Activity, label: log.agent_name, color: '#6b7280' }
  const { Icon } = meta
  const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dotColor = { success: '#10b981', error: '#ef4444', pending: '#f59e0b' }[log.status] || '#6b7280'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace', width: 68, flexShrink: 0, paddingTop: 1 }}>
        {time}
      </span>
      <div style={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 1 }}>
        <Icon size={10} color={meta.color} />
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 600, flexShrink: 0, width: 100, color: meta.color, paddingTop: 1 }}>
        {meta.label}
      </span>
      <span style={{ fontSize: 11.5, color: log.status === 'error' ? '#f87171' : 'rgba(255,255,255,0.5)', flex: 1, lineHeight: 1.45 }}>
        {log.action}
      </span>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4,
        boxShadow: log.status === 'success' ? '0 0 5px rgba(16,185,129,0.5)' : 'none',
      }} />
    </div>
  )
}

/* ── Stat ── */
function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontWeight: 500, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', fontFamily: '"JetBrains Mono", monospace' }}>{value}</span>
    </div>
  )
}

/* ── CEO Briefing ── */
function CeoBriefing() {
  const [data, setData] = useState(null)
  const [running, setRunning] = useState(false)

  const fetchStatus = async () => {
    try { setData(await agentsApi.ceoStatus()) } catch {}
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 120_000)
    return () => clearInterval(interval)
  }, [])

  const handleCheck = async () => {
    setRunning(true)
    try {
      await agentsApi.run('ceo_agent')
      await new Promise(r => setTimeout(r, 3500))
      await fetchStatus()
    } catch {}
    setRunning(false)
  }

  const report   = data?.report || {}
  const overall  = report.overall || (data?.status === 'never_run' ? 'never_run' : null)
  const issues   = report.issues || []
  const warnings = report.warnings || []
  const actions  = report.actions_taken || []
  const stats    = report.stats || {}
  const checkedAt = data?.checked_at
    ? new Date(data.checked_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  const cfg = {
    ok:        { color: '#10b981', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.2)',  label: 'All systems operational' },
    warning:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)',  label: `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}` },
    error:     { color: '#ef4444', bg: 'rgba(239,68,68,0.06)',   border: 'rgba(239,68,68,0.2)',   label: `${issues.length} issue${issues.length !== 1 ? 's' : ''} detected` },
    never_run: { color: 'rgba(255,255,255,0.2)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', label: 'Never checked' },
  }[overall || 'never_run'] || { color: 'rgba(255,255,255,0.2)', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.07)', label: 'Unknown' }

  return (
    <div style={{
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 14, overflow: 'hidden', marginBottom: 16,
    }}>
      <div style={{
        padding: '13px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Crown size={15} color={cfg.color} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
              CEO — Commanding Officer
            </div>
            <div style={{ fontSize: 11, color: cfg.color, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%', background: cfg.color,
                boxShadow: overall === 'ok' ? `0 0 5px ${cfg.color}` : 'none',
                animation: overall === 'ok' ? 'orbBreathe 2s ease-in-out infinite' : 'none',
              }} />
              {cfg.label}
              {checkedAt && <span style={{ color: 'rgba(255,255,255,0.2)', marginLeft: 6, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>· {checkedAt}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={handleCheck}
          disabled={running}
          className="btn-primary"
          style={{ fontSize: 12, padding: '6px 14px' }}
        >
          {running ? (
            <><div style={{ width: 11, height: 11, border: '1.5px solid #D4A843', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Checking...</>
          ) : (
            <><RefreshCcw size={11} /> Run Check</>
          )}
        </button>
      </div>

      {stats.pipeline && (
        <div style={{ padding: '12px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          <Stat label="Preview Ready" value={stats.pipeline.preview_ready ?? 0} />
          <Stat label="Outreach Sent" value={stats.pipeline.outreach_sent ?? 0} />
          <Stat label="Replied" value={(stats.pipeline.replied ?? 0) + (stats.pipeline.interested ?? 0)} />
          <Stat label="WA Queued" value={stats.whatsapp_queued ?? 0} />
        </div>
      )}

      {(issues.length > 0 || warnings.length > 0 || actions.length > 0) && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {issues.map((msg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
              <AlertCircle size={13} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#f87171' }}>{msg}</span>
            </div>
          ))}
          {warnings.map((msg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
              <AlertCircle size={13} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#fbbf24' }}>{msg}</span>
            </div>
          ))}
          {actions.map((msg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
              <CheckCircle2 size={13} color="#34d399" style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#34d399' }}>{msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── CEO Decisions Feed ── */
function CeoDecisions() {
  const [decisions, setDecisions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await agentsApi.ceoDecisions(15)
        setDecisions(data.decisions || [])
      } catch {}
      setLoading(false)
    }
    fetch()
    const t = setInterval(fetch, 120_000)
    return () => clearInterval(t)
  }, [])

  if (loading) return null
  if (!decisions.length) return null

  return (
    <div style={{ ...panel({ overflow: 'hidden', marginBottom: 16 }) }}>
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${C.borderDim}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, boxShadow: `0 0 6px ${C.gold}60` }} />
        <Brain size={12} color={C.gold} />
        <span style={{ ...label(), color: C.textMid, fontSize: 9 }}>CEO DECISIONS — AUTO-COORDINATION LOG</span>
        <span style={{
          marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 99,
          background: 'rgba(212,168,67,0.08)', color: C.gold,
          border: '1px solid rgba(212,168,67,0.15)',
          fontFamily: C.mono,
        }}>{decisions.length}</span>
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {decisions.map((d, i) => {
          const isAlert = d.label.includes('Alert') || d.label.includes('manual check') || d.label.includes('needs')
          const isGood = d.label.includes('rescued') || d.label.includes('retried') || d.label.includes('generated') || d.label.includes('analyzed')
          const dotColor = isAlert ? '#f59e0b' : isGood ? '#10b981' : C.cyan
          const textColor = isAlert ? '#fbbf24' : isGood ? '#34d399' : 'rgba(255,255,255,0.55)'
          const at = d.at ? new Date(d.at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: dotColor,
                flexShrink: 0, marginTop: 5,
                boxShadow: isGood ? `0 0 5px ${dotColor}60` : 'none',
              }} />
              <span style={{ flex: 1, fontSize: 11.5, color: textColor, lineHeight: 1.5 }}>
                {d.label}
              </span>
              <span style={{
                fontSize: 10, color: 'rgba(255,255,255,0.18)',
                fontFamily: C.mono, flexShrink: 0, paddingTop: 1,
              }}>{at}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── A/B Stats ── */
function TemplateStats() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    outreachApi.templateStats().then(setStats).catch(() => {})
  }, [])
  if (!stats?.variants?.length) return null

  const best = [...stats.variants].sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0]
  const maxRate = Math.max(...stats.variants.map(x => x.reply_rate ?? 0), 1)

  return (
    <div style={{ ...panel({ overflow: 'hidden', marginBottom: 16 }) }}>
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${C.borderDim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, opacity: 0.6 }} />
          <span style={{ ...label(), color: C.textMid, fontSize: 9 }}>WHATSAPP A/B TEST — OPENER VARIANTS</span>
        </div>
        {best?.sent > 0 && (
          <span style={{
            fontSize: 11, padding: '2px 9px', borderRadius: 99,
            background: 'rgba(212,168,67,0.1)', color: C.gold,
            border: `1px solid rgba(212,168,67,0.2)`,
            fontFamily: C.mono,
          }}>
            V{best.variant} leading · {best.reply_rate?.toFixed(1) ?? 0}%
          </span>
        )}
      </div>
      <div>
        {stats.variants.map(v => {
          const rate = v.reply_rate ?? 0
          return (
            <div key={v.variant} style={{
              padding: '11px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(255,255,255,0.3)', width: 22, flexShrink: 0 }}>
                V{v.variant}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.preview}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ width: 80, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    background: 'linear-gradient(90deg, #D4A843, #F0C96A)',
                    width: `${maxRate > 0 ? (rate / maxRate) * 100 : 0}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', width: 28, textAlign: 'right', fontFamily: '"JetBrains Mono", monospace' }}>{v.sent}</span>
                <span style={{ fontSize: 12, width: 44, textAlign: 'right', fontWeight: 700, color: rate > 0 ? '#D4A843' : 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace' }}>
                  {rate.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '7px 18px', fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
        sent · reply rate · {stats.unmatched ?? 0} unmatched
      </div>
    </div>
  )
}

/* ── Chat Drawer ── */
function ChatDrawer({ agentName, onClose }) {
  const meta = AGENT_META[agentName] || { Icon: Activity, label: agentName, color: '#6b7280', role: '' }
  const { Icon } = meta
  const c = meta.color

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    setMessages([{
      role: 'assistant',
      content: `Hey — I'm ${meta.label}. Ask me anything about the business.`,
    }])
  }, [agentName])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const msg = input.trim()
    if (!msg || sending) return
    setInput('')
    const newMessages = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setSending(true)
    try {
      const history = newMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      const { reply } = await agentsApi.chat(agentName, msg, history)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}` }])
    }
    setSending(false)
  }

  const onKey = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }

  const suggestedQuestions = {
    ceo_agent: ["What's broken right now?", "What should I fix today?", "Is the pipeline healthy?"],
    cmo_agent: ["Why is my reply rate low?", "What opener should I try next?", "Which channel is performing best?"],
    sales_agent: ["Which leads should I call today?", "Write me a closing message", "How do I handle price objections?"],
    dev_agent: ["Any errors in the last 24h?", "Which agents aren't running?", "What's silently broken?"],
    analyst_agent: ["Which city should I target next?", "What's my conversion funnel look like?", "Are higher quality leads converting better?"],
    research_agent: ["Which UK cities have the most unwebsited barbers?", "Where should I expand next?"],
  }[agentName] || ["What can you tell me?", "What should I focus on?"]

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 440,
      background: 'rgba(2, 2, 14, 0.97)',
      backdropFilter: 'blur(20px)',
      borderLeft: `1px solid ${c}25`,
      display: 'flex', flexDirection: 'column',
      zIndex: 1000,
      boxShadow: `-20px 0 60px rgba(0,0,0,0.5)`,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px', borderBottom: `1px solid ${c}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: `linear-gradient(135deg, ${c}08 0%, transparent 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: c + '18', border: `1px solid ${c}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 12px ${c}20`,
          }}>
            <Icon size={15} color={c} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.88)' }}>
              {meta.label}
            </div>
            <div style={{ fontSize: 10, color: c, opacity: 0.7, display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: c, boxShadow: `0 0 4px ${c}` }} />
              {meta.role}
            </div>
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center',
        }}>
          <X size={14} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {m.role === 'assistant' && (
              <div style={{
                width: 22, height: 22, borderRadius: 7, background: c + '18',
                border: `1px solid ${c}25`, display: 'flex', alignItems: 'center',
                justifyContent: 'center', flexShrink: 0, marginRight: 8, marginTop: 2,
              }}>
                <Icon size={10} color={c} />
              </div>
            )}
            <div style={{
              maxWidth: '80%',
              padding: '9px 13px',
              borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
              background: m.role === 'user'
                ? `linear-gradient(135deg, ${c}22, ${c}18)`
                : 'rgba(255,255,255,0.05)',
              border: m.role === 'user'
                ? `1px solid ${c}35`
                : '1px solid rgba(255,255,255,0.07)',
              fontSize: 12.5,
              lineHeight: 1.55,
              color: m.role === 'user' ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.72)',
              whiteSpace: 'pre-wrap',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 7, background: c + '18',
              border: `1px solid ${c}25`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon size={10} color={c} />
            </div>
            <div style={{
              display: 'flex', gap: 4, padding: '10px 13px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '3px 12px 12px 12px',
            }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 5, height: 5, borderRadius: '50%', background: c,
                  animation: `orbBreathe 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggested questions */}
      {messages.length <= 1 && (
        <div style={{ padding: '0 18px 12px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => { setInput(q); inputRef.current?.focus() }}
              style={{
                padding: '5px 10px', borderRadius: 8,
                background: c + '0e', border: `1px solid ${c}22`,
                color: c, fontSize: 10.5, cursor: 'pointer',
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '12px 18px', borderTop: `1px solid ${c}12`,
        display: 'flex', gap: 10, alignItems: 'flex-end',
        background: 'rgba(0,0,0,0.3)',
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Ask ${meta.label}...`}
          rows={1}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${input ? c + '40' : 'rgba(255,255,255,0.08)'}`,
            borderRadius: 10, padding: '9px 12px',
            color: 'rgba(255,255,255,0.88)', fontSize: 12.5,
            resize: 'none', outline: 'none',
            fontFamily: 'Inter, sans-serif', lineHeight: 1.5,
            maxHeight: 100, overflowY: 'auto',
          }}
        />
        <button
          onClick={send}
          disabled={!input.trim() || sending}
          style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: input.trim() && !sending ? `linear-gradient(135deg, ${c}, ${c}cc)` : 'rgba(255,255,255,0.06)',
            border: 'none', cursor: input.trim() && !sending ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: input.trim() && !sending ? `0 2px 12px ${c}40` : 'none',
          }}
        >
          <Send size={14} color={input.trim() && !sending ? '#000' : 'rgba(255,255,255,0.2)'} />
        </button>
      </div>
    </div>
  )
}

/* ── Main ── */
export default function Agents() {
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const [task, setTask] = useState('auto')
  const [error, setError] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
  const [chatAgent, setChatAgent] = useState(null)
  const pollRef = useRef(null)
  const logEndRef = useRef(null)

  const fetchLogs = async () => {
    try {
      const data = await agentsApi.logs(null, 100)
      setLogs(data.logs || [])
    } catch {}
  }

  useEffect(() => { fetchLogs() }, [])

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  useEffect(() => {
    if (running) { pollRef.current = setInterval(fetchLogs, 2500) }
    else { clearInterval(pollRef.current) }
    return () => clearInterval(pollRef.current)
  }, [running])

  useEffect(() => {
    if (!running || !activeSession) return
    const sessionLogs = logs.filter(l => l.details?.session_id === activeSession)
    const done = sessionLogs.some(l => l.agent_name === 'orchestrator' && l.action.startsWith('Complete'))
    if (done) setRunning(false)
  }, [logs, running, activeSession])

  const handleRun = async () => {
    setError(null)
    setRunning(true)
    try {
      await agentsApi.orchestrate(task)
      setTimeout(async () => {
        const data = await agentsApi.logs(null, 10)
        const newest = (data.logs || []).find(l => l.agent_name === 'orchestrator' && l.details?.session_id)
        if (newest) setActiveSession(newest.details.session_id)
        setLogs(data.logs || [])
      }, 800)
    } catch (err) {
      setError(err.message)
      setRunning(false)
    }
  }

  const now = Date.now()
  const agentStatus = {}
  const agentLastAction = {}
  const agentLastTime = {}

  for (const log of logs) {
    const name = log.agent_name
    if (!agentStatus[name]) {
      const age = now - new Date(log.created_at).getTime()
      agentStatus[name] = log.status === 'pending' ? 'running' : log.status === 'error' ? 'error' : age < 300_000 ? 'done' : 'idle'
      agentLastAction[name] = log.action
      agentLastTime[name] = log.created_at
    }
  }

  const displayLogs = activeSession
    ? [...logs].reverse().filter(l => l.details?.session_id === activeSession)
    : [...logs].reverse().slice(-60)

  const activeCount = Object.values(agentStatus).filter(s => s === 'running').length

  return (
    <>
    <div style={{ padding: '22px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={label()}>AI WORKFORCE</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 9px', borderRadius: 99, background: `rgba(0,212,255,0.04)`, border: `1px solid ${C.borderDim}`, marginLeft: 8 }}>
              <span style={{ ...label(), fontSize: 7.5, color: C.textMid }}>{Object.keys(AGENT_META).length} AGENTS DEPLOYED</span>
              {activeCount > 0 && (
                <>
                  <div style={{ width: 1, height: 10, background: C.borderDim }} />
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: `0 0 5px ${C.green}`, animation: 'orbBreathe 1.8s ease-in-out infinite' }} />
                  <span style={{ ...label(), fontSize: 7.5, color: C.green }}>{activeCount} ON MISSION</span>
                </>
              )}
            </div>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, margin: 0 }}>Workforce</h1>
          <p style={{ fontSize: 11.5, color: C.textMid, margin: '4px 0 0' }}>Click any agent to chat — deploy to run a mission</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <select
              value={task}
              onChange={e => setTask(e.target.value)}
              disabled={running}
              style={{
                background: C.panel, border: `1px solid ${C.border}`,
                color: C.textMid, fontSize: 13, borderRadius: 9,
                padding: '8px 32px 8px 12px', outline: 'none', cursor: 'pointer',
                appearance: 'none', fontFamily: 'Inter, sans-serif',
              }}
            >
              {TASK_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={13} color={C.textDim} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: running ? 'not-allowed' : 'pointer',
              background: running ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
              color: running ? C.textDim : '#000',
              boxShadow: running ? 'none' : `0 2px 14px ${C.gold}32`,
              transition: 'all 0.15s ease',
              fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em',
            }}
          >
            {running ? (
              <><div style={{ width: 14, height: 14, border: `2px solid ${C.textDim}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Deploying...</>
            ) : (
              <><Zap size={13} /> Deploy</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          background: `rgba(255,51,85,0.07)`, border: `1px solid ${C.red}30`,
          borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.red,
        }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* ── CEO BRIEFING ── */}
      <CeoBriefing />

      {/* ── CEO DECISIONS FEED ── */}
      <CeoDecisions />

      {/* ── AGENT ROSTER ── */}
      <div style={{ ...panel(), overflow: 'hidden', marginBottom: 16 }}>
        {/* Roster header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr auto auto auto',
          gap: 14,
          padding: '8px 14px',
          borderBottom: `1px solid ${C.borderDim}`,
        }}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.cyan, opacity: 0.4 }} />
            <span style={label()}>AGENT / LAST MISSION — CLICK TO CHAT</span>
          </div>
          <span style={{ ...label(), textAlign: 'right' }}>TIME</span>
          <span style={{ ...label(), textAlign: 'right', minWidth: 72 }}>STATUS</span>
          <div />
        </div>

        {Object.keys(AGENT_META).map((name, i) => (
          <AgentRow
            key={name}
            name={name}
            status={agentStatus[name] || 'idle'}
            lastAction={agentLastAction[name]}
            lastTime={agentLastTime[name]}
            isFirst={i === 0}
            onChat={setChatAgent}
          />
        ))}
      </div>

      {/* ── A/B STATS ── */}
      <TemplateStats />

      {/* ── OPERATIONS LOG ── */}
      <div style={{ ...panel(), overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: `1px solid ${C.borderDim}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: `0 0 6px ${C.green}`, animation: 'orbBreathe 1.8s ease-in-out infinite' }} />
            <Activity size={13} color={C.textMid} />
            <span style={{ ...label(), color: C.textMid, fontSize: 9 }}>OPERATIONS LOG</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeSession && (
              <span style={{ fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
                session {activeSession}
              </span>
            )}
            {running && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.green }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.green, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
                Live
              </span>
            )}
            <button
              onClick={() => { setActiveSession(null); fetchLogs() }}
              style={{ fontSize: 11, color: C.textDim, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Show all
            </button>
          </div>
        </div>
        <div style={{ padding: '4px 18px', maxHeight: 420, overflowY: 'auto' }}>
          {displayLogs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono, letterSpacing: '0.1em' }}>
              NO ACTIVITY YET — HIT DEPLOY TO START
            </div>
          ) : (
            displayLogs.map(log => <LogLine key={log.id} log={log} />)
          )}
          <div ref={logEndRef} />
        </div>
      </div>

    </div>

    {/* ── AGENT CHAT DRAWER ── */}
    {chatAgent && (
      <>
        <div
          onClick={() => setChatAgent(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 999,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)',
          }}
        />
        <ChatDrawer agentName={chatAgent} onClose={() => setChatAgent(null)} />
      </>
    )}
    </>
  )
}
