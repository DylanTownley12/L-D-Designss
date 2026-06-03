import { useState, useEffect, useRef } from 'react'
import { agents as agentsApi, outreach as outreachApi } from '../api/client'
import {
  Crown, Map, Megaphone, Briefcase, Code2, BarChart2, Network,
  Search, ScanSearch, Palette, Gem, Mail, RotateCcw,
  Play, RefreshCcw, AlertCircle, CheckCircle2, Activity,
  ChevronDown, Zap,
} from 'lucide-react'

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
function AgentRow({ name, status, lastAction, lastTime, isFirst }) {
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: '32px 1fr auto auto',
      gap: 14,
      alignItems: 'center',
      padding: '9px 14px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      background: rowBg,
      transition: 'background 0.3s ease',
      borderLeft: isRunning ? `2px solid ${c}60` : '2px solid transparent',
    }}>

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
    <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>WhatsApp A/B Test</span>
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', marginLeft: 8 }}>opener variants</span>
        </div>
        {best?.sent > 0 && (
          <span style={{
            fontSize: 11, padding: '2px 9px', borderRadius: 99,
            background: 'rgba(212,168,67,0.1)', color: '#D4A843',
            border: '1px solid rgba(212,168,67,0.2)',
            fontFamily: '"JetBrains Mono", monospace',
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

/* ── Main ── */
export default function Agents() {
  const [logs, setLogs] = useState([])
  const [running, setRunning] = useState(false)
  const [task, setTask] = useState('auto')
  const [error, setError] = useState(null)
  const [activeSession, setActiveSession] = useState(null)
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
    <div style={{ padding: '22px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)', margin: 0 }}>
              Workforce
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 9px', borderRadius: 99, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.35)', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>
                {Object.keys(AGENT_META).length} EMPLOYEES DEPLOYED
              </span>
              {activeCount > 0 && (
                <>
                  <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px rgba(16,185,129,0.7)', animation: 'orbBreathe 1.8s ease-in-out infinite' }} />
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: '#10b981', fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.1em' }}>
                    {activeCount} ON MISSION
                  </span>
                </>
              )}
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.28)', margin: 0 }}>
            Agents talk, you watch — deploy when ready
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <select
              value={task}
              onChange={e => setTask(e.target.value)}
              disabled={running}
              style={{
                background: '#0c0c12', border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.6)', fontSize: 13, borderRadius: 9,
                padding: '8px 32px 8px 12px', outline: 'none', cursor: 'pointer',
                appearance: 'none', fontFamily: 'Inter, sans-serif',
              }}
            >
              {TASK_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={13} color="rgba(255,255,255,0.3)" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: 'none', cursor: running ? 'not-allowed' : 'pointer',
              background: running
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, #D4A843 0%, #F0C96A 50%, #D4A843 100%)',
              color: running ? 'rgba(255,255,255,0.3)' : '#000',
              boxShadow: running ? 'none' : '0 2px 14px rgba(212,168,67,0.32)',
              transition: 'all 0.15s ease',
              fontFamily: 'Inter, sans-serif', letterSpacing: '0.02em',
            }}
          >
            {running ? (
              <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Deploying...</>
            ) : (
              <><Zap size={13} /> Deploy</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)',
          borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171',
        }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* ── CEO BRIEFING ── */}
      <CeoBriefing />

      {/* ── AGENT ROSTER ── */}
      <div style={{
        background: '#0c0c12',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 16,
      }}>
        {/* Roster header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '32px 1fr auto auto',
          gap: 14,
          padding: '8px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace' }}>
            EMPLOYEE / LAST MISSION
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace', textAlign: 'right' }}>
            TIME
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.18)', fontFamily: '"JetBrains Mono", monospace', textAlign: 'right', minWidth: 72 }}>
            STATUS
          </span>
        </div>

        {Object.keys(AGENT_META).map((name, i) => (
          <AgentRow
            key={name}
            name={name}
            status={agentStatus[name] || 'idle'}
            lastAction={agentLastAction[name]}
            lastTime={agentLastTime[name]}
            isFirst={i === 0}
          />
        ))}
      </div>

      {/* ── A/B STATS ── */}
      <TemplateStats />

      {/* ── OPERATIONS LOG ── */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={13} color="rgba(255,255,255,0.3)" />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Operations Log</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeSession && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', fontFamily: '"JetBrains Mono", monospace' }}>
                session {activeSession}
              </span>
            )}
            {running && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#10b981' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
                Live
              </span>
            )}
            <button
              onClick={() => { setActiveSession(null); fetchLogs() }}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Show all
            </button>
          </div>
        </div>
        <div style={{ padding: '4px 18px', maxHeight: 420, overflowY: 'auto' }}>
          {displayLogs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.18)', fontSize: 12, fontFamily: '"JetBrains Mono", monospace' }}>
              No activity yet — hit Deploy to start
            </div>
          ) : (
            displayLogs.map(log => <LogLine key={log.id} log={log} />)
          )}
          <div ref={logEndRef} />
        </div>
      </div>

    </div>
  )
}
