import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { dashboard as dashApi, agents, outreach as outreachApi } from '../api/client'
import StatCard from '../components/StatCard'

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

function PipelineFunnel({ pipeline }) {
  const max = Math.max(...pipeline.map(p => p.count), 1)
  return (
    <div className="space-y-2.5">
      {pipeline.map((stage) => {
        const pct = stage.count > 0 ? Math.max((stage.count / max) * 100, 6) : 0
        return (
          <div key={stage.label} className="flex items-center gap-3">
            <div className="w-[88px] text-xs text-white/35 text-right flex-shrink-0 leading-tight">
              {stage.label}
            </div>
            <div className="flex-1 bg-white/4 rounded-full h-7 overflow-hidden">
              {stage.count > 0 ? (
                <div
                  className="h-full rounded-full flex items-center px-3 transition-all duration-700"
                  style={{ width: `${pct}%`, background: stage.color }}
                >
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

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [waking, setWaking] = useState(false)
  const [error, setError] = useState(null)
  const [running, setRunning] = useState(null)
  const [templateStats, setTemplateStats] = useState(null)
  const [conversations, setConversations] = useState([])
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
    outreachApi.templateStats().then(d => setTemplateStats(d)).catch(() => {})
    outreachApi.conversations(5).then(d => setConversations(d.conversations || [])).catch(() => {})
    return () => clearInterval(t)
  }, [])

  const runAgent = async (agent) => {
    setRunning(agent)
    try {
      await agents.run(agent)
      if (agent === 'outreach_writer') {
        navigate('/outreach?generating=1')
      } else {
        alert(`${agent} started — check agent logs for results.`)
      }
    } catch (e) {
      alert(`Error: ${e.message}`)
    } finally {
      setRunning(null)
    }
  }

  if (loading) return (
    <div className="p-8 space-y-2">
      <div className="text-white/40 text-sm">Loading dashboard…</div>
      {waking && <div className="text-white/25 text-xs">Backend waking up — give it a moment…</div>}
    </div>
  )
  if (error) return (
    <div className="p-8 space-y-3">
      <div className="text-red-400 font-medium">Failed to connect to backend.</div>
      <div className="text-white/30 text-sm">{error}</div>
      <button onClick={() => load()} className="btn-ghost text-sm mt-2">↻ Retry</button>
    </div>
  )

  const hasWins = stats.converted > 0

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-white/40 text-sm mt-0.5">L&D Designs — agency command centre</p>
        </div>
        <button onClick={() => load()} className="btn-ghost text-xs">↻ Refresh</button>
      </div>

      {/* ── TODAY'S TASKS — always first, always prominent ── */}
      <div className="card rounded-xl border border-gold/20 bg-gold/3 p-5">
        <h2 className="text-xs font-semibold text-gold/70 uppercase tracking-widest mb-4">Today's Tasks</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'WhatsApp to Send', value: stats.whatsapp_queued, icon: '💬', link: '/outreach', urgent: true },
            { label: 'Instagram Ready',  value: stats.instagram_ready,  icon: '📸', link: '/outreach', urgent: true },
            { label: 'Awaiting Reply',   value: stats.followups_waiting, icon: '🔁', link: '/leads', urgent: false },
            { label: 'Need Attention',   value: stats.need_attention,   icon: '🔥', link: '/leads', urgent: true },
          ].map(t => (
            <a key={t.label} href={t.link}
               className={`rounded-xl p-4 text-center block transition-all hover:scale-[1.02] ${
                 t.urgent && t.value > 0
                   ? 'bg-gold/12 border border-gold/35'
                   : 'bg-white/3 border border-white/6'
               }`}>
              <div className="text-xl mb-1">{t.icon}</div>
              <div className={`text-2xl font-bold tabular-nums ${
                t.urgent && t.value > 0 ? 'text-gold' : 'text-white/50'
              }`}>
                {t.value > 0 ? t.value : '—'}
              </div>
              <div className="text-white/35 text-xs mt-1 leading-tight">{t.label}</div>
            </a>
          ))}
        </div>
      </div>

      {/* ── BAZ HEALTH + TODAY'S SENDS + WINNING OPENER ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Baz health */}
        {(() => {
          const lastSent = stats.last_whatsapp_sent_at
          const minsAgo = lastSent ? Math.floor((Date.now() - new Date(lastSent)) / 60000) : null
          const hoursAgo = minsAgo !== null ? Math.floor(minsAgo / 60) : null
          const isStale = minsAgo === null || minsAgo > 60 * 20
          const label = minsAgo === null ? 'Never sent' : hoursAgo >= 1 ? `${hoursAgo}h ago` : `${minsAgo}m ago`
          return (
            <div className={`card rounded-xl p-4 border ${isStale ? 'border-red-500/30 bg-red-500/5' : 'border-green-400/20 bg-green-400/5'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Baz Status</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isStale ? 'bg-red-500/20 text-red-400' : 'bg-green-400/20 text-green-400'}`}>
                  {isStale ? 'Check Session' : 'Sending'}
                </span>
              </div>
              <div className={`text-xl font-bold ${isStale ? 'text-red-400' : 'text-green-400'}`}>
                {isStale ? '⚠️ Inactive' : '✓ Active'}
              </div>
              <div className="text-white/40 text-xs mt-1">Last WA sent: {label}</div>
              {isStale && (
                <div className="mt-2 text-xs text-red-400/70 font-mono bg-red-500/10 rounded px-2 py-1">
                  ! openclaw channels login --channel whatsapp
                </div>
              )}
            </div>
          )
        })()}

        {/* Today's WA sends */}
        {(() => {
          const sent = stats.whatsapp_today || 0
          const limit = 20
          const pct = Math.min((sent / limit) * 100, 100)
          return (
            <div className="card rounded-xl p-4 border border-white/6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">Today's Sends</span>
                <span className="text-xs text-white/30">/20 limit</span>
              </div>
              <div className="text-2xl font-bold text-gold tabular-nums">{sent}</div>
              <div className="w-full bg-white/5 rounded-full h-2 mt-2">
                <div className="h-2 rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: sent >= limit ? '#10b981' : '#C9A84C' }} />
              </div>
              <div className="text-white/30 text-xs mt-1.5">
                {sent >= limit ? 'Daily limit reached ✓' : `${limit - sent} remaining today`}
              </div>
            </div>
          )
        })()}

        {/* Winning opener */}
        {(() => {
          const variants = templateStats?.variants || []
          const withData = variants.filter(v => v.sent > 0 && v.reply_rate !== null)
          const best = withData.sort((a, b) => b.reply_rate - a.reply_rate)[0]
          return (
            <div className="card rounded-xl p-4 border border-purple-400/20 bg-purple-400/5">
              <div className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">Winning Opener</div>
              {best ? (
                <>
                  <div className="text-xl font-bold text-purple-400">{best.reply_rate}% reply rate</div>
                  <div className="text-white/40 text-xs mt-1">Template {best.variant} · {best.sent} sent · {best.replied} replied</div>
                  <div className="text-white/25 text-xs mt-2 italic truncate">"{best.preview}"</div>
                </>
              ) : (
                <>
                  <div className="text-white/40 text-sm">No data yet</div>
                  <div className="text-white/25 text-xs mt-1">Send more messages to see which opener wins</div>
                </>
              )}
            </div>
          )
        })()}
      </div>

      {/* ── BAZ CONVERSATION FEED ── */}
      {conversations.length > 0 && (
        <div className="card p-5 rounded-xl">
          <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-4">Recent Replies — Baz Conversations</h2>
          <div className="space-y-3">
            {conversations.map((c, i) => (
              <div key={i} className="bg-white/3 border border-white/6 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-sm font-medium text-white/80">{c.lead?.business_name || 'Unknown'}</span>
                    <span className="text-white/30 text-xs ml-2">{c.lead?.city}</span>
                  </div>
                  <span className="text-white/20 text-xs">
                    {c.at ? new Date(c.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
                <div className="space-y-2">
                  {c.we_sent && (
                    <div className="flex gap-2">
                      <span className="text-xs text-gold/60 flex-shrink-0 w-12 text-right">Dylan</span>
                      <div className="bg-gold/10 border border-gold/15 rounded-lg px-3 py-1.5 text-xs text-white/60 flex-1">{c.we_sent}</div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <span className="text-xs text-blue-400/60 flex-shrink-0 w-12 text-right">Barber</span>
                    <div className="bg-blue-400/10 border border-blue-400/15 rounded-lg px-3 py-1.5 text-xs text-white/80 flex-1">{c.barber_said}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── WINS — only shown if there are converted clients ── */}
      {hasWins ? (
        <div className="card rounded-xl border border-emerald-500/20 bg-emerald-500/3 p-5">
          <h2 className="text-xs font-semibold text-emerald-400/70 uppercase tracking-widest mb-4">
            🏆 Wins — {stats.converted} Paying Client{stats.converted !== 1 ? 's' : ''}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {(stats.wins || []).map((w, i) => (
              <div key={i} className="flex items-center gap-3 bg-emerald-500/8 border border-emerald-500/12 rounded-xl px-3 py-2.5">
                <span className="text-lg flex-shrink-0">💈</span>
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{w.business_name}</div>
                  <div className="text-white/35 text-xs">{w.city}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card rounded-xl border border-white/5 p-6 text-center">
          <div className="text-3xl mb-2">🎯</div>
          <div className="text-white/50 font-medium text-sm">First client incoming</div>
          <div className="text-white/25 text-xs mt-1">Keep sending — it only takes one yes to get started</div>
        </div>
      )}

      {/* ── STATS GRID ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard label="Total Leads"   value={stats.total_leads}                          icon="🎯" color="gold" />
        <StatCard label="New Leads"     value={stats.new_leads}                            icon="✨" color="blue" />
        <StatCard label="Outreach Sent" value={stats.outreach_sent}                        icon="📤" color="blue" sub="all time" />
        <StatCard label="Replies"       value={stats.replies}                              icon="💬" color="purple" />
        <StatCard label="Interested"    value={stats.interested}                           icon="🔥" color="green" />
        <StatCard label="Converted"     value={stats.converted}                            icon="💷" color="green" sub="paid clients" />
        <StatCard label="Previews"      value={stats.previews_generated}                   icon="🌐" color="purple" />
        <StatCard label="Queue"         value={stats.outreach_queued}                      icon="⏳" color="gold" sub="awaiting send" />
        <StatCard label="Emails Today"  value={`${stats.emails_today}/50`}                 icon="📧" color={stats.emails_today >= 50 ? 'red' : 'blue'} />
        <StatCard label="Revenue"       value={`£${(stats.revenue_total || 0).toFixed(0)}`} icon="💰" color="green" />
      </div>

      {/* ── CHARTS ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Activity chart */}
        <div className="lg:col-span-2 card p-5 rounded-xl">
          <h2 className="font-semibold mb-4 text-xs text-white/50 uppercase tracking-widest">7-Day Outreach</h2>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={stats.activity || []} barSize={18}>
              <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#555', fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: 8 }}
                labelStyle={{ color: '#666', fontSize: 11 }}
                itemStyle={{ color: '#C9A84C', fontSize: 11 }}
              />
              <Bar dataKey="sent" fill="#C9A84C" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pipeline funnel */}
        <div className="card p-5 rounded-xl">
          <h2 className="font-semibold mb-5 text-xs text-white/50 uppercase tracking-widest">Pipeline Funnel</h2>
          <PipelineFunnel pipeline={stats.pipeline || []} />
        </div>
      </div>

      {/* ── NOTIFICATIONS ── */}
      {stats.notifications?.length > 0 && (
        <div className="card p-5 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest">
              Notifications
              {stats.unread_notifications > 0 && (
                <span className="ml-2 text-gold">({stats.unread_notifications})</span>
              )}
            </h2>
            <button onClick={() => dashApi.markRead().then(() => load(true))}
                    className="text-xs text-white/25 hover:text-gold transition-colors">
              Mark all read
            </button>
          </div>
          <div className="space-y-2">
            {stats.notifications.map(n => (
              <div key={n.id} className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                n.read ? 'bg-white/2 text-white/40' : 'bg-gold/5 border border-gold/15'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className={n.read ? 'text-white/50 text-sm' : 'text-white font-medium text-sm'}>{n.title}</div>
                  {n.body && <div className="text-white/35 text-xs mt-0.5 truncate">{n.body}</div>}
                </div>
                <div className="text-white/20 text-xs flex-shrink-0">
                  {new Date(n.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AGENT CONTROLS ── */}
      <div className="card p-5 rounded-xl">
        <h2 className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-4">Run Agents Manually</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { agent: 'lead_finder',        label: 'Find Leads',       icon: '🔍' },
            { agent: 'website_analyzer',   label: 'Analyse Sites',    icon: '🔬' },
            { agent: 'preview_generator',  label: 'Gen Previews',     icon: '🌐' },
            { agent: 'whatsapp_campaign',  label: 'WhatsApp Queue',   icon: '💬' },
            { agent: 'instagram_campaign', label: 'Instagram Queue',  icon: '📸' },
            { agent: 'outreach_writer',    label: 'Write Emails',     icon: '✍️' },
            { agent: 'followup_agent',     label: 'Follow-ups',       icon: '🔁' },
            { agent: 'outreach_queue',     label: 'Send Emails',      icon: '📤' },
          ].map(a => (
            <button
              key={a.agent}
              onClick={() => runAgent(a.agent)}
              disabled={!!running}
              className={`btn-ghost flex items-center gap-2 justify-center text-xs py-2.5 disabled:opacity-40 ${
                running === a.agent ? 'border-gold/40 text-gold' : ''
              }`}
            >
              <span>{a.icon}</span>
              <span>{running === a.agent ? 'Running…' : a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
