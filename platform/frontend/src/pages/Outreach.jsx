import { useState, useEffect } from 'react'
import { outreach as outreachApi } from '../api/client'

function MessageCard({ msg, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`card rounded-xl p-4 border ${
      msg.status === 'queued' ? 'border-gold/20 bg-gold/3' : 'border-white/6'
    }`}>
      <div className="flex items-start gap-3">
        {/* Channel icon */}
        <div className="text-xl flex-shrink-0">
          {msg.channel === 'email' ? '📧' : msg.channel === 'sms' ? '💬' : '📱'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">
              {msg.leads?.business_name || 'Unknown'}
            </span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-white/40 text-xs">{msg.leads?.city}</span>
            <span className={`badge ml-auto ${
              msg.status === 'queued' ? 'bg-amber-500/20 text-amber-400' :
              msg.status === 'sent'   ? 'bg-emerald-500/20 text-emerald-400' :
              msg.status === 'failed' ? 'bg-red-500/20 text-red-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {msg.status}
            </span>
          </div>

          {msg.subject && (
            <div className="text-white/60 text-xs mb-2 font-medium">Re: {msg.subject}</div>
          )}

          <div className={`text-white/50 text-sm leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            {msg.body}
          </div>

          <button onClick={() => setExpanded(!expanded)}
                  className="text-xs text-white/25 hover:text-gold mt-1 transition-colors">
            {expanded ? '▲ Less' : '▼ More'}
          </button>

          <div className="text-white/25 text-xs mt-2">
            Day {msg.sequence_day || 1} · {msg.ai_generated ? 'AI written' : 'Manual'} ·{' '}
            {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>

      {msg.status === 'queued' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/6">
          <button onClick={() => onApprove(msg.id)}
                  className="btn-gold flex-1 py-2 text-sm">
            ✓ Approve &amp; Send
          </button>
          <button onClick={() => onReject(msg.id)}
                  className="btn-ghost flex-1 py-2 text-sm">
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function Outreach() {
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('queue')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [q, h, s] = await Promise.all([
        outreachApi.queue('queued'),
        outreachApi.history(50),
        outreachApi.statsToday(),
      ])
      setQueue(q.messages || [])
      setHistory(h.messages || [])
      setStats(s)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const approve = async (id) => {
    try {
      await outreachApi.approve(id)
      showToast('Approved and sending!')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const reject = async (id) => {
    try {
      await outreachApi.reject(id)
      showToast('Message rejected')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const sendAll = async () => {
    if (!confirm(`Send all ${queue.length} queued messages now?`)) return
    try {
      await outreachApi.sendAllApproved()
      showToast('Sending all approved messages...')
      setTimeout(load, 2000)
    } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>{toast.msg}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Outreach</h1>
          <p className="text-white/40 text-sm mt-0.5">Review, approve, and send messages</p>
        </div>
        {queue.length > 0 && (
          <button onClick={sendAll} className="btn-gold">
            Send All ({queue.length})
          </button>
        )}
      </div>

      {/* Daily stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Emails Today', value: `${stats.emails_sent_today}/${stats.email_limit}`, warn: stats.emails_sent_today >= stats.email_limit },
            { label: 'SMS Today',    value: `${stats.sms_sent_today}/${stats.sms_limit}`,    warn: stats.sms_sent_today >= stats.sms_limit },
            { label: 'In Queue',     value: queue.length,   warn: false },
            { label: 'History',      value: history.length, warn: false },
          ].map(s => (
            <div key={s.label} className={`card p-3 rounded-xl text-center ${s.warn ? 'border-red-500/30' : ''}`}>
              <div className={`text-xl font-bold ${s.warn ? 'text-red-400' : 'text-gold'}`}>{s.value}</div>
              <div className="text-white/40 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-2 rounded-lg p-1 w-fit">
        {['queue', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    tab === t ? 'bg-gold text-black' : 'text-white/50 hover:text-white'
                  }`}>
            {t === 'queue' ? `Queue (${queue.length})` : `History (${history.length})`}
          </button>
        ))}
      </div>

      {/* Messages */}
      {loading ? (
        <div className="text-white/30 text-sm text-center py-12">Loading messages...</div>
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📤</div>
            <div className="text-white/40 text-sm">Queue is empty. Generate outreach from the Leads page.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map(msg => <MessageCard key={msg.id} msg={msg} onApprove={approve} onReject={reject} />)}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📬</div>
            <div className="text-white/40 text-sm">No messages sent yet.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map(msg => <MessageCard key={msg.id} msg={msg} onApprove={approve} onReject={reject} />)}
          </div>
        )
      )}
    </div>
  )
}
