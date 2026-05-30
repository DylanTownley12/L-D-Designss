import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { outreach as outreachApi, agents, webhooks, instagram as instagramApi } from '../api/client'

function MessageCard({ msg, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`card rounded-xl p-4 border ${
      msg.status === 'queued' ? 'border-gold/20 bg-gold/3' : 'border-white/6'
    }`}>
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">
          {msg.channel === 'email' ? '📧' : msg.channel === 'sms' ? '💬' : '📱'}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{msg.leads?.business_name || 'Unknown'}</span>
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
          <button onClick={() => onApprove(msg.id)} className="btn-gold flex-1 py-2 text-sm">
            ✓ Approve &amp; Send
          </button>
          <button onClick={() => onReject(msg.id)} className="btn-ghost flex-1 py-2 text-sm">
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  )
}

function WhatsAppCard({ msg, onDone }) {
  const [copied, setCopied] = useState(false)
  const phone = (msg.leads?.phone || '').replace(/\s|-|\+/g, '').replace(/^0/, '44')
  const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.body)}` : null

  const copy = () => {
    navigator.clipboard.writeText(msg.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card rounded-xl p-4 border border-green-500/20 bg-green-500/3">
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">💬</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm">{msg.leads?.business_name || 'Unknown'}</span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-white/40 text-xs">{msg.leads?.city}</span>
            <span className="text-white/25 text-xs ml-auto">📱 {msg.leads?.phone}</span>
          </div>
          <div className="text-white/70 text-sm leading-relaxed bg-white/5 rounded-lg p-3 whitespace-pre-wrap">
            {msg.body}
          </div>
          <div className="text-white/25 text-xs mt-2">
            {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-white/6">
        {waLink ? (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
             className="btn-gold flex-1 py-2 text-sm text-center">
            📱 Open WhatsApp
          </a>
        ) : (
          <button onClick={copy} className="btn-gold flex-1 py-2 text-sm">
            {copied ? '✓ Copied!' : '📋 Copy Message'}
          </button>
        )}
        <button onClick={onDone} className="btn-ghost px-4 py-2 text-sm text-white/40">
          ✓ Sent
        </button>
      </div>
    </div>
  )
}

function WhatsAppSentCard({ msg, onLogReply }) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')

  const submit = () => {
    if (!replyText.trim()) return
    onLogReply(msg.lead_id, replyText)
    setReplying(false)
    setReplyText('')
  }

  return (
    <div className="card rounded-xl p-4 border border-white/6 opacity-70 hover:opacity-100 transition-opacity">
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">💬</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{msg.leads?.business_name || 'Unknown'}</span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-white/40 text-xs">{msg.leads?.city}</span>
            <span className="badge bg-emerald-500/20 text-emerald-400 ml-auto">sent</span>
          </div>
          <div className="text-white/40 text-xs line-clamp-2">{msg.body}</div>
          <div className="text-white/25 text-xs mt-1">
            {new Date(msg.sent_at || msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · 📱 {msg.leads?.phone}
          </div>
        </div>
      </div>
      {replying ? (
        <div className="mt-3 pt-3 border-t border-white/6 space-y-2">
          <textarea
            autoFocus
            className="w-full bg-dark-2 border border-white/10 rounded-lg p-3 text-sm text-white resize-none focus:outline-none focus:border-gold/50"
            rows={3}
            placeholder="What did they say?"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />
          <div className="flex gap-2">
            <button onClick={submit} disabled={!replyText.trim()}
                    className="btn-gold flex-1 py-2 text-sm disabled:opacity-40">
              ✓ Log Reply
            </button>
            <button onClick={() => { setReplying(false); setReplyText('') }}
                    className="btn-ghost px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setReplying(true)}
                className="mt-3 w-full py-2 text-sm text-white/40 hover:text-gold border border-white/8 hover:border-gold/30 rounded-lg transition-all">
          💬 Got a reply? Log it
        </button>
      )}
    </div>
  )
}

function InstagramCard({ msg }) {
  const [copied, setCopied] = useState(false)
  const igUrl = msg.leads?.instagram_url

  const copy = () => {
    navigator.clipboard.writeText(msg.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card rounded-xl p-4 border border-purple-500/20 bg-purple-500/3">
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">📸</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-sm">{msg.leads?.business_name || 'Unknown'}</span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-white/40 text-xs">{msg.leads?.city}</span>
            {igUrl && (
              <a href={igUrl} target="_blank" rel="noopener noreferrer"
                 className="text-purple-400 text-xs ml-auto hover:text-purple-300 truncate max-w-32">
                {igUrl.replace('https://www.instagram.com/', '@').replace('https://instagram.com/', '@').replace(/\/$/, '')}
              </a>
            )}
          </div>
          <div className="text-white/70 text-sm leading-relaxed bg-white/5 rounded-lg p-3">
            {msg.body}
          </div>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-white/6">
        {igUrl && (
          <a href={igUrl} target="_blank" rel="noopener noreferrer"
             className="btn-ghost flex-1 py-2 text-sm text-center text-purple-400 hover:text-purple-300">
            Open Instagram
          </a>
        )}
        <button onClick={copy} className="btn-gold flex-1 py-2 text-sm">
          {copied ? '✓ Copied!' : '📋 Copy DM'}
        </button>
      </div>
    </div>
  )
}

export default function Outreach() {
  const [queue, setQueue] = useState([])
  const [whatsappQueue, setWhatsappQueue] = useState([])
  const [whatsappSent, setWhatsappSent] = useState([])
  const [instagramQueue, setInstagramQueue] = useState([])
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('whatsapp')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const pollRef = useRef(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = async () => {
    setLoading(true)
    try {
      const [q, wa, waSent, ig, h, s] = await Promise.all([
        outreachApi.queue('queued'),
        outreachApi.queueByChannel('whatsapp', 'queued'),
        outreachApi.queueByChannel('whatsapp', 'sent'),
        instagramApi.queue(),
        outreachApi.history(50),
        outreachApi.statsToday(),
      ])
      setQueue((q.messages || []).filter(m => m.channel === 'email'))
      setWhatsappQueue(wa.messages || [])
      setWhatsappSent(
        (waSent.messages || [])
          .filter(m => m.leads?.status === 'outreach_sent')
          .slice(-30)
          .reverse()
      )
      setInstagramQueue(ig.messages || [])
      setHistory(h.messages || [])
      setStats(s)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (searchParams.get('generating') === '1') {
      setGenerating(true)
      setSearchParams({}, { replace: true })
      showToast('Writing outreach in background — auto-refreshing…')
      let attempts = 0
      pollRef.current = setInterval(async () => {
        attempts++
        await load()
        if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) }
      }, 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  useEffect(() => {
    if (generating && (queue.length > 0 || whatsappQueue.length > 0)) {
      clearInterval(pollRef.current)
      setGenerating(false)
      showToast('Messages ready for review!')
    }
  }, [queue.length, whatsappQueue.length, generating])

  const markWhatsAppSent = async (id) => {
    try {
      await outreachApi.markSent(id)
      showToast('Marked as sent!')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const logReply = async (lead_id, message) => {
    try {
      await webhooks.logReply(lead_id, message)
      showToast('Reply logged! Lead moved to Replied.')
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

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

  const writeOutreach = async () => {
    setGenerating(true)
    try {
      await agents.run('outreach_writer')
      showToast('Writing outreach in background — auto-refreshing…')
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        attempts++
        await load()
        if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) }
      }, 5000)
    } catch (e) {
      showToast(e.message, 'error')
      setGenerating(false)
    }
  }

  const waTotal = whatsappQueue.length + whatsappSent.length

  const generateInstagram = async () => {
    try {
      await agents.run('instagram_campaign')
      showToast('Generating Instagram DMs in background…')
      setTimeout(load, 3000)
    } catch (e) { showToast(e.message, 'error') }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>{toast.msg}</div>
      )}

      {generating && (
        <div className="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3 text-sm text-gold flex items-center gap-2">
          <span className="animate-pulse">●</span>
          Writing outreach in background — this page refreshes automatically every 5 seconds.
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Outreach</h1>
          <p className="text-white/40 text-sm mt-0.5">Review, approve, and send messages</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn-ghost text-sm">
            {loading ? 'Loading…' : '↻ Refresh'}
          </button>
          <button onClick={writeOutreach} disabled={generating} className="btn-ghost text-sm">
            {generating ? '✍️ Writing…' : '✍️ Write Emails'}
          </button>
          {tab === 'whatsapp' && (
            <button onClick={async () => {
              await outreachApi.clearInvalidWhatsapp()
              showToast('Cleared invalid messages')
              load()
            }} className="btn-ghost text-sm text-red-400/60 hover:text-red-400">
              🗑 Clear Invalid
            </button>
          )}
          {tab === 'queue' && queue.length > 0 && (
            <button onClick={sendAll} className="btn-gold">
              Send All ({queue.length})
            </button>
          )}
        </div>
      </div>

      {/* Daily stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Emails Today', value: `${stats.emails_sent_today}/${stats.email_limit}`, warn: stats.emails_sent_today >= stats.email_limit },
            { label: 'SMS Today',    value: `${stats.sms_sent_today}/${stats.sms_limit}`,    warn: stats.sms_sent_today >= stats.sms_limit },
            { label: 'WA Queue',     value: whatsappQueue.length, warn: false },
            { label: 'History',      value: history.length,       warn: false },
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
        {[
          { key: 'whatsapp',   label: `💬 WhatsApp (${waTotal})` },
          { key: 'instagram',  label: `📸 Instagram (${instagramQueue.length})` },
          { key: 'queue',      label: `📧 Email Queue (${queue.length})` },
          { key: 'history',    label: `History (${history.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    tab === t.key ? 'bg-gold text-black' : 'text-white/50 hover:text-white'
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      {loading ? (
        <div className="text-white/30 text-sm text-center py-12">Loading messages...</div>
      ) : tab === 'whatsapp' ? (
        whatsappQueue.length === 0 && whatsappSent.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">💬</div>
            <div className="text-white/40 text-sm">No WhatsApp messages generated yet.</div>
            <div className="text-white/25 text-xs mt-2">
              Click "WhatsApp Campaign" on the Dashboard to generate messages for leads with phone numbers.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {whatsappQueue.length > 0 && (
              <div className="space-y-3">
                {whatsappQueue.map(msg => (
                  <WhatsAppCard key={msg.id} msg={msg} onDone={() => markWhatsAppSent(msg.id)} />
                ))}
              </div>
            )}
            {whatsappSent.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-white/30 uppercase tracking-wider pt-1">
                  Sent — waiting for reply ({whatsappSent.length})
                </h3>
                {whatsappSent.map(msg => (
                  <WhatsAppSentCard key={msg.id} msg={msg} onLogReply={logReply} />
                ))}
              </div>
            )}
          </div>
        )
      ) : tab === 'instagram' ? (
        instagramQueue.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📸</div>
            <div className="text-white/40 text-sm">No Instagram DM scripts generated yet.</div>
            <div className="text-white/25 text-xs mt-2 mb-4">
              Generates scripts for preview-ready leads that have an Instagram page.
            </div>
            <button onClick={generateInstagram} className="btn-gold text-sm">
              Generate Instagram DMs
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-white/30 pb-1">
              Copy the DM, open their Instagram, send manually. {instagramQueue.length} scripts ready.
            </div>
            {instagramQueue.map(msg => <InstagramCard key={msg.id} msg={msg} />)}
          </div>
        )
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📤</div>
            <div className="text-white/40 text-sm">Email queue is empty.</div>
            <div className="text-white/25 text-xs mt-2">
              Run "Write Emails" above to generate emails for leads with email addresses.
            </div>
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
