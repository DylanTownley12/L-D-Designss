import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { dashboard as dashApi, agents } from '../api/client'
import StatCard from '../components/StatCard'

const STATUS_COLORS = {
  new: '#6b7280', analyzing: '#3b82f6', preview_ready: '#8b5cf6',
  outreach_queued: '#f59e0b', outreach_sent: '#06b6d4',
  replied: '#f59e0b', interested: '#8b5cf6', converted: '#10b981',
  not_interested: '#ef4444', do_not_contact: '#7f1d1d',
}

const MAX_RETRIES = 4
const RETRY_DELAY = 8000

async function fetchStatsWithRetry(attempt = 0) {
  try {
    return await dashApi.stats()
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY))
      return fetchStatsWithRetry(attempt + 1)
    }
    throw err
  }
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking] = useState(false)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(null)
  const navigate = useNavigate()

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    const wakeTimer = setTimeout(() => setWaking(true), 5000)
    try {
      const data = await fetchStatsWithRetry()
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
    return () => clearInterval(t)
  }, [])

  const runAgent = async (agent) => {
    setRunning(agent)
    try {
      await agents.run(agent)
      if (agent === 'outreach_writer') {
        // Navigate to Outreach immediately — messages appear as background task completes
        navigate('/outreach?generating=1')
      } else {
        alert(`${agent} started. Check agent logs for results.`)
      }
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setRunning(null)
    }
  }

  if (loading) return (
    <div className="p-8 space-y-2">
      <div className="text-white/40">Loading dashboard…</div>
      {waking && (
        <div className="text-white/30 text-sm">
          Backend is taking a moment to respond…
        </div>
      )}
    </div>
  )
  if (error) return (
    <div className="p-8 space-y-3">
      <div className="text-red-400">Failed to connect to backend.</div>
      <div className="text-white/30 text-sm">{error}</div>
      <button onClick={() => load()} className="btn-ghost text-sm mt-2">Retry</button>
    </div>
  )

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Dashboard</h1>
        <p className="text-white/40 text-sm">Your agency at a glance</p>
      </div>

      {/* Today's Tasks */}
      <div className="card p-5 rounded-xl border border-gold/15 bg-gold/3">
        <h2 className="font-semibold mb-4 text-sm text-gold/80 uppercase tracking-wider">Today's Tasks</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'WhatsApp to Send',
              value: stats.whatsapp_queued,
              icon: '💬',
              link: '/outreach',
              urgent: stats.whatsapp_queued > 0,
              empty: 'None queued',
            },
            {
              label: 'Instagram DMs Ready',
              value: stats.instagram_ready,
              icon: '📸',
              link: '/outreach',
              urgent: stats.instagram_ready > 0,
              empty: 'None ready',
            },
            {
              label: 'Follow-ups Pending',
              value: stats.followups_waiting,
              icon: '🔁',
              link: '/leads',
              urgent: false,
              empty: 'All clear',
            },
            {
              label: 'Need Attention',
              value: stats.need_attention,
              icon: '🔥',
              link: '/leads',
              urgent: stats.need_attention > 0,
              empty: 'No replies yet',
            },
          ].map(t => (
            <a key={t.label} href={t.link}
               className={`rounded-xl p-4 text-center transition-all hover:scale-[1.02] cursor-pointer block ${
                 t.urgent && t.value > 0
                   ? 'bg-gold/10 border border-gold/30'
                   : 'bg-white/3 border border-white/8'
               }`}>
              <div className="text-2xl mb-1">{t.icon}</div>
              <div className={`text-2xl font-bold ${t.urgent && t.value > 0 ? 'text-gold' : 'text-white/60'}`}>
                {t.value > 0 ? t.value : '—'}
              </div>
              <div className="text-white/40 text-xs mt-1">{t.value > 0 ? t.label : t.empty}</div>
            </a>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <StatCard label="Total Leads"     value={stats.total_leads}       icon="🎯" color="gold" />
        <StatCard label="New Leads"       value={stats.new_leads}         icon="✨" color="blue" />
        <StatCard label="Outreach Sent"   value={stats.outreach_sent}     icon="📤" color="blue"   sub="all time" />
        <StatCard label="Replies"         value={stats.replies}           icon="💬" color="purple" />
        <StatCard label="Interested"      value={stats.interested}        icon="🔥" color="green" />
        <StatCard label="Converted"       value={stats.converted}         icon="💷" color="green" sub="paid clients" />
        <StatCard label="Previews"        value={stats.previews_generated} icon="🌐" color="purple" />
        <StatCard label="Queue"           value={stats.outreach_queued}   icon="⏳" color="gold" sub="awaiting approval" />
        <StatCard label="Emails Today"    value={`${stats.emails_today}/50`} icon="📧" color={stats.emails_today >= 50 ? 'red' : 'blue'} />
        <StatCard label="Revenue"         value={`£${stats.revenue_total.toFixed(0)}`} icon="💰" color="green" />
      </div>

      {/* Charts + Notifications row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* 7-day activity chart */}
        <div className="lg:col-span-2 card p-5 rounded-xl">
          <h2 className="font-semibold mb-4 text-sm text-white/60 uppercase tracking-wider">7-Day Outreach Activity</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stats.activity || []} barSize={20}>
              <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 11 }}
                     tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#555', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#141414', border: '1px solid #333', borderRadius: 8 }}
                labelStyle={{ color: '#888' }}
                itemStyle={{ color: '#C9A84C' }}
              />
              <Bar dataKey="sent" fill="#C9A84C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline breakdown */}
        <div className="card p-5 rounded-xl">
          <h2 className="font-semibold mb-4 text-sm text-white/60 uppercase tracking-wider">Pipeline</h2>
          <div className="space-y-3">
            {(stats.pipeline || []).map(p => (
              <div key={p.label} className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }}></div>
                <span className="text-sm text-white/60 flex-1">{p.label}</span>
                <span className="font-bold text-sm">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Notifications */}
      {stats.notifications?.length > 0 && (
        <div className="card p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sm text-white/60 uppercase tracking-wider">
              Notifications <span className="text-gold ml-1">({stats.unread_notifications})</span>
            </h2>
            <button onClick={() => dashApi.markRead().then(load)}
                    className="text-xs text-white/30 hover:text-gold transition-colors">
              Mark all read
            </button>
          </div>
          <div className="space-y-2">
            {stats.notifications.map(n => (
              <div key={n.id}
                   className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                     n.read ? 'bg-white/2 text-white/40' : 'bg-gold/5 border border-gold/15'
                   }`}>
                <div className="flex-1">
                  <div className={n.read ? 'text-white/50' : 'text-white font-medium'}>{n.title}</div>
                  {n.body && <div className="text-white/35 text-xs mt-0.5 truncate">{n.body}</div>}
                </div>
                <div className="text-white/25 text-xs flex-shrink-0">
                  {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agent controls */}
      <div className="card p-5 rounded-xl">
        <h2 className="font-semibold mb-4 text-sm text-white/60 uppercase tracking-wider">Run Agents Manually</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { agent: 'lead_finder',        label: 'Find New Leads',      icon: '🔍' },
            { agent: 'website_analyzer',  label: 'Analyse Websites',   icon: '🔬' },
            { agent: 'extract_emails',    label: 'Extract Emails',     icon: '📧' },
            { agent: 'preview_generator', label: 'Generate Previews',  icon: '🌐' },
            { agent: 'whatsapp_campaign', label: 'WhatsApp Campaign',  icon: '💬' },
            { agent: 'outreach_writer',   label: 'Write Emails',       icon: '✍️' },
            { agent: 'followup_agent',    label: 'Check Follow-Ups',   icon: '🔁' },
            { agent: 'outreach_queue',    label: 'Send Email Queue',   icon: '📤' },
          ].map(a => (
            <button
              key={a.agent}
              onClick={() => runAgent(a.agent)}
              disabled={running === a.agent}
              className="btn-ghost flex items-center gap-2 justify-center disabled:opacity-50"
            >
              <span>{a.icon}</span>
              <span className="text-xs">{running === a.agent ? 'Running…' : a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
