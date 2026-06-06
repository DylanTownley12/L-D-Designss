/**
 * AGENTS — Live status for all 21 agents.
 * Section A: 12 Backend Python agents (scheduled pipeline)
 * Section B: 9 OpenClaw agents (daily handoff chain)
 */
import { useState, useEffect, useCallback } from 'react'
import { agents as agentsApi } from '../api/client'
import {
  Crown, Map, Megaphone, Briefcase, Code2, BarChart2, Network,
  Search, ScanSearch, Palette, Gem, Mail, RotateCcw,
  Play, RefreshCcw, AlertCircle, CheckCircle2, Activity,
  Zap, MessageSquare, Brain, AlertTriangle,
} from 'lucide-react'

const C = {
  bg:        '#02020e',
  panel:     'rgba(0, 8, 28, 0.7)',
  border:    'rgba(0, 212, 255, 0.1)',
  borderDim: 'rgba(0, 212, 255, 0.06)',
  cyan:      '#00D4FF',
  gold:      '#D4A843',
  green:     '#00FF88',
  amber:     '#fbbf24',
  red:       '#FF3355',
  text:      'rgba(255,255,255,0.88)',
  textMid:   'rgba(255,255,255,0.42)',
  textDim:   'rgba(255,255,255,0.16)',
  mono:      '"JetBrains Mono", monospace',
}
const lbl = (x = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...x })
const panel = (x = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, ...x })

const BACKEND_META = {
  ceo_agent:         { Icon: Crown,      label: 'CEO Agent',       color: C.gold,    desc: 'Hourly health check + auto-fix' },
  lead_finder:       { Icon: Search,     label: 'Lead Finder',     color: '#3b82f6', desc: 'Finds barbers with no website' },
  website_analyzer:  { Icon: ScanSearch, label: 'Site Analyzer',   color: '#8b5cf6', desc: 'Scores website quality' },
  preview_generator: { Icon: Palette,    label: 'Preview Builder', color: '#06b6d4', desc: 'Builds free preview sites' },
  lead_enricher:     { Icon: Gem,        label: 'Lead Enricher',   color: '#ec4899', desc: 'Finds emails + Instagram' },
  outreach_writer:   { Icon: Mail,       label: 'Outreach Writer', color: '#10b981', desc: 'Writes WhatsApp + email copy' },
  outreach_sender:   { Icon: MessageSquare, label: 'Outreach Sender', color: '#22c55e', desc: 'Sends approved emails' },
  followup_agent:    { Icon: RotateCcw,  label: 'Follow-up',       color: '#f59e0b', desc: 'Sends day-3, 7, 14 follow-ups' },
  preview_refresher: { Icon: RefreshCcw, label: 'Preview Refresh', color: '#14b8a6', desc: 'Re-engages stale previews daily' },
  notification_agent:{ Icon: AlertCircle,label: 'Notifications',   color: '#94a3b8', desc: 'Pushes alerts to Dylan' },
  orchestrator:      { Icon: Network,    label: 'Orchestrator',    color: C.gold,    desc: 'Dispatches agents as needed' },
  self_heal:         { Icon: Zap,        label: 'Self-Heal',       color: '#a855f7', desc: 'Retries safe failures every 30m' },
}

const TEAM_META = {
  scout:    { Icon: Search,    label: 'Scout',    color: '#3b82f6', role: 'Triage new leads' },
  gap:      { Icon: BarChart2, label: 'Gap',      color: '#a855f7', role: 'Rank opportunity 0–10' },
  judge:    { Icon: ScanSearch,label: 'Judge',    color: '#8b5cf6', role: 'GO / HOLD / REJECT' },
  maker:    { Icon: Palette,   label: 'Maker',    color: '#06b6d4', role: 'Plan the preview site' },
  reach:    { Icon: Megaphone, label: 'Reach',    color: '#f97316', role: 'Write outreach + copy' },
  executor: { Icon: Zap,       label: 'Executor', color: '#eab308', role: 'Stage for send' },
  closer:   { Icon: Gem,       label: 'Closer',   color: '#22c55e', role: 'Draft replies' },
  profit:   { Icon: Activity,  label: 'Profit',   color: '#10b981', role: 'Analytics + A/B tests' },
  chief:    { Icon: Crown,     label: 'Chief',    color: C.gold,    role: 'Coordinate + brief Dylan' },
}

const STATUS_CONFIG = {
  running: { color: C.green,   label: 'RUNNING', pulse: true },
  active:  { color: C.cyan,    label: 'ACTIVE',  pulse: false },
  error:   { color: C.red,     label: 'ERROR',   pulse: false },
  stale:   { color: C.amber,   label: 'STALE',   pulse: false },
  idle:    { color: 'rgba(255,255,255,0.18)', label: 'STANDBY', pulse: false },
}

function relTime(iso) {
  if (!iso) return 'never'
  const d = Date.now() - new Date(iso).getTime()
  if (d < 8000) return 'just now'
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function StatusDot({ status, size = 8 }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {cfg.pulse && (
        <div style={{
          position: 'absolute', inset: -3, borderRadius: '50%',
          background: cfg.color, opacity: 0.25,
          animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
        }} />
      )}
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: cfg.color,
        boxShadow: `0 0 ${size}px ${cfg.color}80`,
      }} />
    </div>
  )
}

function AgentRow({ agent, onRun }) {
  const meta = BACKEND_META[agent.name] || { Icon: Brain, label: agent.name, color: '#6b7280', desc: '' }
  const { Icon } = meta
  const cfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle
  const [launching, setLaunching] = useState(false)

  const handleRun = async (e) => {
    e.stopPropagation()
    if (launching) return
    setLaunching(true)
    try { await agentsApi.run(agent.name) } catch {}
    setTimeout(() => setLaunching(false), 5000)
  }

  const isRunning = agent.status === 'running' || launching

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '28px 1fr 100px 80px 80px',
      gap: 12,
      alignItems: 'center',
      padding: '10px 16px',
      borderBottom: `1px solid ${C.borderDim}`,
      background: isRunning ? `linear-gradient(90deg, ${meta.color}0a 0%, transparent 100%)` : 'transparent',
      borderLeft: agent.status === 'error' ? `2px solid ${C.red}` : agent.status === 'stale' ? `2px solid ${C.amber}` : '2px solid transparent',
      transition: 'all 0.2s ease',
    }}>
      {/* Icon */}
      <div style={{
        width: 28, height: 28, borderRadius: 7,
        background: `${meta.color}15`,
        border: `1px solid ${meta.color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={13} style={{ color: meta.color }} />
      </div>

      {/* Name + desc */}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 2 }}>{meta.label}</div>
        <div style={{ fontSize: 10.5, color: C.textMid }}>{
          agent.last_action && agent.last_action !== 'heartbeat'
            ? agent.last_action.length > 55 ? agent.last_action.slice(0, 55) + '…' : agent.last_action
            : meta.desc
        }</div>
      </div>

      {/* Schedule */}
      <div style={{ ...lbl(), textAlign: 'right' }}>{agent.schedule_label}</div>

      {/* Last seen */}
      <div style={{ ...lbl({ color: C.textMid }), textAlign: 'right' }}>{relTime(agent.last_seen)}</div>

      {/* Status + run */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <StatusDot status={launching ? 'running' : agent.status} />
          <span style={{ ...lbl({ color: cfg.color }), fontSize: 8 }}>{cfg.label}</span>
        </div>
        <button
          onClick={handleRun}
          disabled={launching}
          title={`Run ${meta.label}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5,
            border: `1px solid ${C.cyan}30`,
            background: `${C.cyan}0a`,
            color: C.cyan, cursor: launching ? 'wait' : 'pointer',
            opacity: launching ? 0.4 : 1,
            transition: 'all 0.13s',
          }}
        >
          <Play size={10} />
        </button>
      </div>
    </div>
  )
}

function TeamCard({ agent }) {
  const meta = TEAM_META[agent.name] || { Icon: Brain, label: agent.name, color: '#6b7280', role: '' }
  const { Icon } = meta
  const cfg = STATUS_CONFIG[agent.status] || STATUS_CONFIG.idle

  return (
    <div style={{
      ...panel({ padding: '12px 14px' }),
      borderLeft: `2px solid ${meta.color}40`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: `${meta.color}15`, border: `1px solid ${meta.color}30`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={12} style={{ color: meta.color }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{meta.label}</div>
          <div style={{ fontSize: 9.5, color: C.textDim }}>{meta.role}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <StatusDot status={agent.status} size={6} />
          <span style={{ ...lbl({ color: cfg.color }), fontSize: 7.5 }}>{cfg.label}</span>
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.textMid }}>
        {agent.last_action
          ? (agent.last_action.length > 50 ? agent.last_action.slice(0, 50) + '…' : agent.last_action)
          : 'No tasks yet'}
      </div>
      {agent.last_seen && (
        <div style={{ ...lbl({ marginTop: 4 }) }}>{relTime(agent.last_seen)}</div>
      )}
    </div>
  )
}

export default function Agents() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    try {
      const d = await agentsApi.status()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    const t = setInterval(fetch, 20000)
    return () => clearInterval(t)
  }, [fetch])

  const backendAgents = data?.agents?.filter(a => a.group === 'backend') || []
  const teamAgents = data?.agents?.filter(a => a.group === 'openclaw') || []
  const counts = data?.counts || {}
  const health = data?.health || 'ok'

  const healthColor = health === 'ok' ? '#10b981' : health === 'critical' ? C.red : C.amber
  const healthMsg = health === 'ok'
    ? `All ${data?.total || 21} agents operational`
    : `${(counts.error || 0) + (counts.stale || 0)} agent(s) need attention`

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 32px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.03em', margin: 0 }}>
            Agent Status
          </h1>
          <button
            onClick={fetch}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: 'transparent', color: C.textMid,
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <RefreshCcw size={12} /> Refresh
          </button>
        </div>

        {/* Health banner */}
        {!loading && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 14px', borderRadius: 8,
            background: `${healthColor}12`,
            border: `1px solid ${healthColor}30`,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: healthColor, boxShadow: `0 0 6px ${healthColor}` }} />
            <span style={{ fontSize: 11.5, fontWeight: 600, color: healthColor }}>{healthMsg}</span>
            {counts.running > 0 && (
              <span style={{ fontSize: 10, color: C.textMid, marginLeft: 4 }}>{counts.running} running now</span>
            )}
          </div>
        )}
      </div>

      {loading && (
        <div style={{ color: C.textDim, fontSize: 13, padding: 40, textAlign: 'center' }}>Loading agent status…</div>
      )}
      {error && (
        <div style={{ color: C.red, fontSize: 13, padding: 20, background: 'rgba(255,51,85,0.08)', borderRadius: 10 }}>
          Could not load status: {error}
        </div>
      )}

      {/* Section A — Backend Pipeline */}
      {backendAgents.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={lbl({ fontSize: 10, marginBottom: 4 })}>Pipeline Agents — Scheduled Automation</div>
            <div style={{ fontSize: 12, color: C.textMid }}>
              These run on a schedule and handle everything from finding leads to sending follow-ups.
            </div>
          </div>
          <div style={{ ...panel({ overflow: 'hidden' }) }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 100px 80px 80px',
              gap: 12,
              padding: '8px 16px',
              borderBottom: `1px solid ${C.borderDim}`,
            }}>
              {['', 'AGENT', 'SCHEDULE', 'LAST RUN', 'STATUS'].map((h, i) => (
                <div key={i} style={{ ...lbl({ textAlign: i > 1 ? 'right' : 'left' }) }}>{h}</div>
              ))}
            </div>
            {backendAgents.map(agent => (
              <AgentRow key={agent.name} agent={agent} onRun={agentsApi.run} />
            ))}
          </div>
        </div>
      )}

      {/* Section B — OpenClaw Team */}
      {teamAgents.length > 0 && (
        <div>
          <div style={{ marginBottom: 14 }}>
            <div style={lbl({ fontSize: 10, marginBottom: 4 })}>OpenClaw Team — Daily Handoff Chain</div>
            <div style={{ fontSize: 12, color: C.textMid }}>
              9 LLM agents that pick up tasks each morning: scout → gap → judge → maker → reach → executor → closer → profit → chief.
            </div>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}>
            {teamAgents.map(agent => (
              <TeamCard key={agent.name} agent={agent} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
