import { useState, useEffect, useRef } from 'react'
import { agents as agentsApi, outreach as outreachApi } from '../api/client'
import {
  Crown, Map, Megaphone, Briefcase, Code2, BarChart2, Network,
  Search, ScanSearch, Palette, Gem, Mail, RotateCcw,
  Play, RefreshCcw, AlertCircle, CheckCircle2, Activity,
  ChevronDown,
} from 'lucide-react'

const AGENT_META = {
  ceo_agent:         { Icon: Crown,      label: 'CEO',              desc: 'System health + auto-fix every 2h' },
  research_agent:    { Icon: Map,        label: 'Research',         desc: 'City & opportunity intelligence' },
  cmo_agent:         { Icon: Megaphone,  label: 'CMO',              desc: 'Reply rates, trends & strategy' },
  sales_agent:       { Icon: Briefcase,  label: 'Sales Rep',        desc: 'Closes interested leads' },
  dev_agent:         { Icon: Code2,      label: 'Developer',        desc: 'Error patterns & missed jobs' },
  analyst_agent:     { Icon: BarChart2,  label: 'Data Analyst',     desc: 'Funnel stats & city performance' },
  orchestrator:      { Icon: Network,    label: 'Orchestrator',     desc: 'Decides what runs and when' },
  lead_finder:       { Icon: Search,     label: 'Lead Finder',      desc: 'Finds barbers with no website' },
  website_analyzer:  { Icon: ScanSearch, label: 'Website Analyzer', desc: 'Checks site quality + contact info' },
  preview_generator: { Icon: Palette,    label: 'Preview Generator',desc: 'Builds free preview websites' },
  lead_enricher:     { Icon: Gem,        label: 'Lead Enricher',    desc: 'Finds emails + Instagram handles' },
  outreach_writer:   { Icon: Mail,       label: 'Outreach Writer',  desc: 'Writes WhatsApp & email messages' },
  followup_agent:    { Icon: RotateCcw,  label: 'Follow-up Agent',  desc: 'Sends 48hr follow-ups' },
}

const AGENT_COLORS = {
  ceo_agent: '#D4A843', research_agent: '#14b8a6', cmo_agent: '#f97316',
  sales_agent: '#22c55e', dev_agent: '#94a3b8', analyst_agent: '#a855f7',
  orchestrator: '#D4A843', lead_finder: '#3b82f6', website_analyzer: '#8b5cf6',
  preview_generator: '#06b6d4', lead_enricher: '#ec4899', outreach_writer: '#10b981',
  followup_agent: '#f59e0b',
}

const TASK_OPTIONS = [
  { value: 'auto',              label: 'Auto — run what\'s needed' },
  { value: 'find_leads',        label: 'Find new leads' },
  { value: 'generate_previews', label: 'Generate previews' },
  { value: 'send_outreach',     label: 'Queue WhatsApp messages' },
  { value: 'followup',          label: 'Send follow-ups' },
]

function AgentCard({ name, status, lastAction }) {
  const meta = AGENT_META[name] || { Icon: Activity, label: name, desc: '' }
  const { Icon } = meta
  const color = AGENT_COLORS[name] || '#6b7280'

  const statusConfig = {
    running: { dot: '#10b981', pulse: true,  label: 'Running', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.28)' },
    done:    { dot: '#10b981', pulse: false, label: 'Done',    bg: 'rgba(16,185,129,0.07)', border: 'rgba(16,185,129,0.2)' },
    error:   { dot: '#ef4444', pulse: false, label: 'Error',   bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)' },
    idle:    { dot: 'rgba(255,255,255,0.12)', pulse: false, label: 'Idle', bg: 'rgba(255,255,255,0.018)', border: 'rgba(255,255,255,0.06)' },
  }[status] || { dot: 'rgba(255,255,255,0.12)', pulse: false, label: 'Idle', bg: 'rgba(255,255,255,0.018)', border: 'rgba(255,255,255,0.06)' }

  const isActive = status === 'running' || status === 'done'

  return (
    <div style={{
      background: isActive ? `linear-gradient(135deg, ${color}0e 0%, #0c0c12 100%)` : '#0c0c12',
      border: `1px solid ${statusConfig.border}`,
      borderRadius: 14,
      padding: '14px 14px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      transition: 'all 0.3s ease',
      boxShadow: status === 'running' ? `0 0 20px ${color}18, 0 4px 16px rgba(0,0,0,0.3)` : '0 2px 8px rgba(0,0,0,0.25)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: isActive ? color + '20' : 'rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
          boxShadow: status === 'running' ? `0 0 12px ${color}30` : 'none',
        }}>
          <Icon size={16} color={isActive ? color : 'rgba(255,255,255,0.3)'} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: statusConfig.dot,
            boxShadow: statusConfig.pulse ? `0 0 8px ${statusConfig.dot}` : 'none',
            ...(statusConfig.pulse ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
          }} />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)' }}>
          {meta.label}
        </div>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', marginTop: 2, lineHeight: 1.4 }}>
          {meta.desc}
        </div>
      </div>
      {lastAction && (
        <div style={{
          fontSize: 10, color: 'rgba(255,255,255,0.3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '4px 8px',
          border: '1px solid rgba(255,255,255,0.05)',
          fontFamily: '"JetBrains Mono", monospace',
        }} title={lastAction}>
          {lastAction}
        </div>
      )}
    </div>
  )
}

function LogLine({ log }) {
  const meta = AGENT_META[log.agent_name] || { Icon: Activity, label: log.agent_name }
  const { Icon } = meta
  const color = AGENT_COLORS[log.agent_name] || '#6b7280'
  const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dotColor = { success: '#10b981', error: '#ef4444', pending: '#f59e0b' }[log.status] || '#6b7280'

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{
        color: 'rgba(255,255,255,0.2)', fontSize: 10.5, fontFamily: '"JetBrains Mono", monospace',
        width: 68, flexShrink: 0, paddingTop: 1,
      }}>
        {time}
      </span>
      <div style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 1 }}>
        <Icon size={11} color={color} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, flexShrink: 0, width: 110, color, paddingTop: 1 }}>
        {meta.label}
      </span>
      <span style={{ fontSize: 11.5, color: log.status === 'error' ? '#f87171' : 'rgba(255,255,255,0.55)', flex: 1, lineHeight: 1.5 }}>
        {log.action}
      </span>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 4,
        boxShadow: log.status === 'success' ? '0 0 6px rgba(16,185,129,0.5)' : 'none',
      }} />
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.28)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: 'white', letterSpacing: '-0.02em' }}>{value}</span>
    </div>
  )
}

function CeoPanel() {
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

  const report = data?.report || {}
  const overall = report.overall || (data?.status === 'never_run' ? 'never_run' : null)
  const issues = report.issues || []
  const warnings = report.warnings || []
  const actions = report.actions_taken || []
  const stats = report.stats || {}
  const checkedAt = data?.checked_at
    ? new Date(data.checked_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  const statusConfig = {
    ok:        { color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)', dot: '#10b981', pulse: true,  label: 'All systems operational' },
    warning:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)', dot: '#f59e0b', pulse: false, label: `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}` },
    error:     { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)',  dot: '#ef4444', pulse: false, label: `${issues.length} issue${issues.length !== 1 ? 's' : ''} detected` },
    never_run: { color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', dot: 'rgba(255,255,255,0.2)', pulse: false, label: 'Never checked' },
  }[overall || 'never_run'] || { color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', dot: 'rgba(255,255,255,0.2)', pulse: false, label: 'Unknown' }

  return (
    <div style={{
      background: `linear-gradient(135deg, ${statusConfig.bg} 0%, #0c0c12 100%)`,
      border: `1px solid ${statusConfig.border}`,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 20,
    }}>
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, background: statusConfig.bg,
            border: `1px solid ${statusConfig.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Crown size={15} color={statusConfig.color} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>CEO — System Health</div>
            <div style={{ fontSize: 11, color: statusConfig.color, marginTop: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', background: statusConfig.dot,
                ...(statusConfig.pulse ? { animation: 'pulse 2s ease-in-out infinite' } : {}),
                boxShadow: statusConfig.pulse ? `0 0 6px ${statusConfig.dot}` : 'none',
              }} />
              {statusConfig.label}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {checkedAt && (
            <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: '"JetBrains Mono", monospace' }}>
              last check {checkedAt}
            </span>
          )}
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
      </div>

      {stats.pipeline && (
        <div style={{ padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
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

function TemplateStats() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    outreachApi.templateStats().then(setStats).catch(() => {})
  }, [])
  if (!stats?.variants?.length) return null

  const best = [...stats.variants].sort((a, b) => (b.reply_rate || 0) - (a.reply_rate || 0))[0]
  const maxRate = Math.max(...stats.variants.map(x => x.reply_rate ?? 0), 1)

  return (
    <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.65)' }}>A/B Test — WhatsApp Openers</span>
        {best?.sent > 0 && (
          <span style={{
            fontSize: 11, padding: '2px 9px', borderRadius: 99,
            background: 'rgba(212,168,67,0.12)', color: '#D4A843',
            border: '1px solid rgba(212,168,67,0.22)',
          }}>
            Best: V{best.variant} · {best.reply_rate?.toFixed(1) ?? 0}% reply rate
          </span>
        )}
      </div>
      <div>
        {stats.variants.map(v => {
          const rate = v.reply_rate ?? 0
          return (
            <div key={v.variant} style={{
              padding: '12px 18px',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <span style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'rgba(255,255,255,0.35)', width: 24, flexShrink: 0 }}>
                V{v.variant}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.preview}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ width: 80, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 99,
                    background: 'linear-gradient(90deg, #D4A843, #F0C96A)',
                    width: `${maxRate > 0 ? (rate / maxRate) * 100 : 0}%`,
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', width: 28, textAlign: 'right' }}>{v.sent}</span>
                <span style={{ fontSize: 12, width: 44, textAlign: 'right', fontWeight: 600, color: rate > 0 ? '#D4A843' : 'rgba(255,255,255,0.2)' }}>
                  {rate.toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '8px 18px', fontSize: 10.5, color: 'rgba(255,255,255,0.22)' }}>
        sent · reply rate · {stats.unmatched ?? 0} unmatched (sent before tracking)
      </div>
    </div>
  )
}

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
  for (const log of logs) {
    const name = log.agent_name
    if (!agentStatus[name]) {
      const age = now - new Date(log.created_at).getTime()
      agentStatus[name] = log.status === 'pending' ? 'running' : log.status === 'error' ? 'error' : age < 300_000 ? 'done' : 'idle'
      agentLastAction[name] = log.action
    }
  }

  const displayLogs = activeSession
    ? [...logs].reverse().filter(l => l.details?.session_id === activeSession)
    : [...logs].reverse().slice(-60)

  return (
    <div style={{ padding: '24px 24px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)' }}>
            Agents
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', marginTop: 4 }}>
            Orchestrate your pipeline — agents talk, you watch
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <select
              value={task}
              onChange={e => setTask(e.target.value)}
              disabled={running}
              style={{
                background: '#0c0c12',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'rgba(255,255,255,0.65)',
                fontSize: 13,
                borderRadius: 9,
                padding: '8px 32px 8px 12px',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                fontFamily: 'Inter, sans-serif',
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
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 18px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              border: 'none',
              cursor: running ? 'not-allowed' : 'pointer',
              background: running
                ? 'rgba(255,255,255,0.06)'
                : 'linear-gradient(135deg, #D4A843 0%, #F0C96A 50%, #D4A843 100%)',
              color: running ? 'rgba(255,255,255,0.35)' : '#000',
              boxShadow: running ? 'none' : '0 2px 12px rgba(212,168,67,0.3)',
              transition: 'all 0.15s ease',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            {running ? (
              <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Running...</>
            ) : (
              <><Play size={13} /> Run Pipeline</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 18,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171',
        }}>
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* CEO Panel */}
      <CeoPanel />

      {/* Agent Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: 10,
        marginBottom: 20,
      }}>
        {Object.keys(AGENT_META).map(name => (
          <AgentCard
            key={name}
            name={name}
            status={agentStatus[name] || 'idle'}
            lastAction={agentLastAction[name]}
          />
        ))}
      </div>

      {/* A/B Stats */}
      <TemplateStats />

      {/* Activity Log */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={14} color="rgba(255,255,255,0.35)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Activity Log</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {activeSession && (
              <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.25)', fontFamily: '"JetBrains Mono", monospace' }}>
                session {activeSession}
              </span>
            )}
            {running && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#10b981' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', animation: 'pulse 1.5s ease-in-out infinite' }} />
                Live
              </span>
            )}
            <button
              onClick={() => { setActiveSession(null); fetchLogs() }}
              style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Show all
            </button>
          </div>
        </div>
        <div style={{ padding: '6px 18px', maxHeight: 400, overflowY: 'auto' }}>
          {displayLogs.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
              No activity yet — hit Run Pipeline to start
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
