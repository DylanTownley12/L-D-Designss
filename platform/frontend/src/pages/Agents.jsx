import { useState, useEffect, useRef } from 'react'
import { agents as agentsApi } from '../api/client'

const AGENT_META = {
  orchestrator:      { icon: '🧠', label: 'Orchestrator',       desc: 'Decides what runs and when' },
  lead_finder:       { icon: '🔍', label: 'Lead Finder',        desc: 'Finds barbers with no website' },
  website_analyzer:  { icon: '🔬', label: 'Website Analyzer',   desc: 'Checks site quality + contact info' },
  preview_generator: { icon: '🎨', label: 'Preview Generator',  desc: 'Builds free preview websites' },
  outreach_writer:   { icon: '✉️',  label: 'Outreach Writer',    desc: 'Writes WhatsApp & email messages' },
  followup_agent:    { icon: '🔁', label: 'Follow-up Agent',    desc: 'Sends 48hr follow-ups' },
}

const TASK_OPTIONS = [
  { value: 'auto',              label: 'Auto — run what\'s needed' },
  { value: 'find_leads',        label: 'Find new leads' },
  { value: 'generate_previews', label: 'Generate previews' },
  { value: 'send_outreach',     label: 'Queue WhatsApp messages' },
  { value: 'followup',          label: 'Send follow-ups' },
]

const AGENT_COLORS = {
  orchestrator:      '#C9A84C',
  lead_finder:       '#3b82f6',
  website_analyzer:  '#8b5cf6',
  preview_generator: '#06b6d4',
  outreach_writer:   '#10b981',
  followup_agent:    '#f59e0b',
}

function AgentCard({ name, status, lastAction }) {
  const meta = AGENT_META[name] || { icon: '🤖', label: name, desc: '' }
  const color = AGENT_COLORS[name] || '#ffffff'

  const statusDot = {
    running: <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse inline-block" />,
    done:    <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />,
    error:   <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />,
    idle:    <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />,
  }[status] || <span className="w-2.5 h-2.5 rounded-full bg-white/20 inline-block" />

  return (
    <div
      className="bg-dark-2 border rounded-xl p-4 flex flex-col gap-2 transition-all duration-300"
      style={{
        borderColor: status === 'idle' ? 'rgba(255,255,255,0.06)' : color + '55',
        boxShadow:   status === 'running' ? `0 0 16px ${color}33` : 'none',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-2xl">{meta.icon}</span>
        {statusDot}
      </div>
      <div>
        <div className="text-sm font-semibold text-white/90">{meta.label}</div>
        <div className="text-xs text-white/35 mt-0.5">{meta.desc}</div>
      </div>
      {lastAction && (
        <div className="text-xs text-white/40 mt-1 truncate" title={lastAction}>
          {lastAction}
        </div>
      )}
    </div>
  )
}

function LogLine({ log }) {
  const meta = AGENT_META[log.agent_name] || { icon: '🤖', label: log.agent_name }
  const color = AGENT_COLORS[log.agent_name] || '#ffffff'
  const time = new Date(log.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const dotColor = {
    success: '#10b981',
    error:   '#ef4444',
    pending: '#f59e0b',
  }[log.status] || '#6b7280'

  return (
    <div className="flex items-start gap-3 py-2 border-b border-white/4 last:border-0">
      <span className="text-white/25 text-xs font-mono w-20 flex-shrink-0 pt-0.5">{time}</span>
      <span className="text-sm flex-shrink-0 w-5">{meta.icon}</span>
      <span className="text-xs font-semibold flex-shrink-0 w-32" style={{ color }}>
        {meta.label}
      </span>
      <span className="text-xs text-white/60 flex-1 leading-relaxed">{log.action}</span>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: dotColor }} />
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

  useEffect(() => {
    fetchLogs()
  }, [])

  // Auto-scroll log to bottom when new entries arrive
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs.length])

  // Poll while running
  useEffect(() => {
    if (running) {
      pollRef.current = setInterval(fetchLogs, 2500)
    } else {
      clearInterval(pollRef.current)
    }
    return () => clearInterval(pollRef.current)
  }, [running])

  // Detect when orchestrator session finishes
  useEffect(() => {
    if (!running || !activeSession) return
    const sessionLogs = logs.filter(l => l.details?.session_id === activeSession)
    const done = sessionLogs.some(
      l => l.agent_name === 'orchestrator' && l.action.startsWith('Complete')
    )
    if (done) setRunning(false)
  }, [logs, running, activeSession])

  const handleRun = async () => {
    setError(null)
    setRunning(true)
    try {
      const res = await agentsApi.orchestrate(task)
      // Start polling — session_id isn't returned yet so we detect it from logs
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

  // Compute per-agent status from recent logs
  const now = Date.now()
  const agentStatus = {}
  const agentLastAction = {}

  for (const log of logs) {
    const name = log.agent_name
    if (!agentStatus[name]) {
      const age = now - new Date(log.created_at).getTime()
      if (log.status === 'pending') {
        agentStatus[name] = 'running'
      } else if (log.status === 'error') {
        agentStatus[name] = 'error'
      } else if (age < 300_000) {
        agentStatus[name] = 'done'
      } else {
        agentStatus[name] = 'idle'
      }
      agentLastAction[name] = log.action
    }
  }

  // Filter logs to current session if one is active, else show all recent
  const displayLogs = activeSession
    ? [...logs].reverse().filter(l => l.details?.session_id === activeSession)
    : [...logs].reverse().slice(-50)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Agents</h1>
          <p className="text-sm text-white/35 mt-0.5">Orchestrate your pipeline — agents talk, you watch</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={task}
            onChange={e => setTask(e.target.value)}
            disabled={running}
            className="bg-dark-3 border border-white/10 text-white/70 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-gold/40 disabled:opacity-40"
          >
            {TASK_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: running ? '#374151' : '#C9A84C', color: running ? '#9ca3af' : '#000' }}
          >
            {running ? '⏳ Running...' : '▶ Run Pipeline'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Agent cards */}
      <div className="grid grid-cols-3 gap-3 mb-6 lg:grid-cols-6">
        {Object.keys(AGENT_META).map(name => (
          <AgentCard
            key={name}
            name={name}
            status={agentStatus[name] || 'idle'}
            lastAction={agentLastAction[name]}
          />
        ))}
      </div>

      {/* Activity log */}
      <div className="bg-dark-2 border border-white/6 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
          <span className="text-sm font-semibold text-white/70">Activity Log</span>
          <div className="flex items-center gap-3">
            {activeSession && (
              <span className="text-xs text-white/30 font-mono">session {activeSession}</span>
            )}
            {running && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                Live
              </span>
            )}
            <button
              onClick={() => { setActiveSession(null); fetchLogs() }}
              className="text-xs text-white/25 hover:text-white/50 transition-colors"
            >
              Show all
            </button>
          </div>
        </div>
        <div className="px-4 max-h-96 overflow-y-auto">
          {displayLogs.length === 0 ? (
            <div className="py-12 text-center text-white/25 text-sm">
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
