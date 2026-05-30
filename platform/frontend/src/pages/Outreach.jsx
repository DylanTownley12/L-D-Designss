import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { outreach as outreachApi, agents, instagram as instagramApi } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

const WA_ICON = (
  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

// Highlight URLs in plain text message body
function MessageBody({ text }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return (
    <span>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
             className="text-gold underline break-all font-medium hover:text-gold-light">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  )
}

// ── WhatsApp QUEUE card (to send) ────────────────────────────────────────────
function WhatsAppCard({ msg, onMarkSent }) {
  const [sending, setSending] = useState(false)
  const phone = (msg.leads?.phone || '').replace(/[\s\-\+]/g, '').replace(/^0/, '44')
  const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.body)}` : null
  const hasUrl = /https?:\/\//.test(msg.body)

  const handleOpenWA = async () => {
    if (!waLink) return
    window.open(waLink, '_blank')
    setSending(true)
    try {
      await onMarkSent(msg.id)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="card rounded-xl overflow-hidden border border-emerald-500/15 bg-emerald-500/3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-white/5">
        <div>
          <div className="font-semibold text-sm">{msg.leads?.business_name || 'Unknown'}</div>
          <div className="text-white/40 text-xs mt-0.5">
            {msg.leads?.city}
            {msg.leads?.phone && <span className="ml-2 text-white/30">· 📱 {msg.leads.phone}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasUrl && (
            <span className="text-[10px] bg-gold/15 text-gold px-2 py-0.5 rounded-full font-semibold">
              ✓ preview link
            </span>
          )}
          <span className="text-white/20 text-xs">
            {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>

      {/* Message body */}
      <div className="px-5 py-4 bg-black/20">
        <p className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap">
          <MessageBody text={msg.body} />
        </p>
      </div>

      {/* Action */}
      <div className="px-5 py-4">
        {waLink ? (
          <button
            onClick={handleOpenWA}
            disabled={sending}
            className="w-full btn-gold py-3.5 text-sm font-semibold flex items-center justify-center gap-2.5 disabled:opacity-60"
          >
            {WA_ICON}
            {sending ? 'Opening…' : 'Open WhatsApp — mark as sent'}
          </button>
        ) : (
          <div className="text-center text-red-400/70 text-xs py-2">
            No mobile number — can't send via WhatsApp
          </div>
        )}
      </div>
    </div>
  )
}

// ── WhatsApp SENT card (sent today, waiting for reply) ───────────────────────
function WhatsAppSentCard({ msg, onLogReply }) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!replyText.trim()) return
    setSaving(true)
    try {
      await onLogReply(msg.id, replyText.trim())
      setReplying(false)
      setReplyText('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card rounded-xl border border-white/6 bg-white/2">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{msg.leads?.business_name || 'Unknown'}</span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-white/40 text-xs">{msg.leads?.city}</span>
            <span className="badge bg-emerald-500/20 text-emerald-400 ml-auto text-[10px]">sent</span>
          </div>
          <div className="text-white/30 text-xs mt-0.5 truncate">{msg.body}</div>
          {msg.leads?.phone && (
            <div className="text-white/20 text-[10px] mt-0.5">📱 {msg.leads.phone}</div>
          )}
        </div>
      </div>

      {replying ? (
        <div className="px-4 pb-4 space-y-2 border-t border-white/5 pt-3">
          <textarea
            autoFocus
            className="w-full bg-dark-2 border border-white/10 rounded-lg p-3 text-sm text-white resize-none focus:outline-none focus:border-gold/50 placeholder-white/20"
            rows={3}
            placeholder="What did they say?"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!replyText.trim() || saving}
              className="btn-gold flex-1 py-2 text-sm disabled:opacity-40"
            >
              {saving ? 'Saving…' : '✓ Log Reply'}
            </button>
            <button
              onClick={() => { setReplying(false); setReplyText('') }}
              className="btn-ghost px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3 border-t border-white/5 pt-2">
          <button
            onClick={() => setReplying(true)}
            className="w-full py-2 text-xs text-white/30 hover:text-gold border border-white/6 hover:border-gold/20 rounded-lg transition-all"
          >
            💬 Got a reply? Log it
          </button>
        </div>
      )}
    </div>
  )
}

// ── Email queue card ─────────────────────────────────────────────────────────
function MessageCard({ msg, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`card rounded-xl p-4 border ${
      msg.status === 'queued' ? 'border-gold/20 bg-gold/3' : 'border-white/6'
    }`}>
      <div className="flex items-start gap-3">
        <div className="text-xl flex-shrink-0">
          {msg.channel === 'email' ? '📧' : '📱'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{msg.leads?.business_name || 'Unknown'}</span>
            <span className="text-white/30 text-xs">·</span>
            <span className="text-white/40 text-xs">{msg.leads?.city}</span>
            <span className={`badge ml-auto ${
              msg.status === 'queued' ? 'bg-amber-500/20 text-amber-400' :
              msg.status === 'sent'   ? 'bg-emerald-500/20 text-emerald-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>{msg.status}</span>
          </div>
          {msg.subject && <div className="text-white/60 text-xs mb-2 font-medium">Re: {msg.subject}</div>}
          <div className={`text-white/50 text-sm leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
            {msg.body}
          </div>
          <button onClick={() => setExpanded(!expanded)}
                  className="text-xs text-white/25 hover:text-gold mt-1 transition-colors">
            {expanded ? '▲ Less' : '▼ More'}
          </button>
          <div className="text-white/25 text-xs mt-2">
            Day {msg.sequence_day || 1} · {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
      {msg.status === 'queued' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-white/6">
          <button onClick={() => onApprove(msg.id)} className="btn-gold flex-1 py-2 text-sm">✓ Approve & Send</button>
          <button onClick={() => onReject(msg.id)} className="btn-ghost flex-1 py-2 text-sm">✗ Reject</button>
        </div>
      )}
    </div>
  )
}

// ── Instagram card ───────────────────────────────────────────────────────────
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
                 className="text-purple-400 text-xs ml-auto hover:text-purple-300 truncate max-w-[120px]">
                {igUrl.replace(/https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}
              </a>
            )}
          </div>
          <div className="text-white/70 text-sm leading-relaxed bg-white/5 rounded-lg p-3">{msg.body}</div>
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Outreach() {
  const [queue, setQueue] = useState([])
  const [whatsappQueue, setWhatsappQueue] = useState([])
  const [whatsappSentToday, setWhatsappSentToday] = useState([])
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
    setTimeout(() => setToast(null), 3500)
  }

  const todayStr = new Date().toISOString().slice(0, 10)

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
      // "Sent Today" = sent today, lead hasn't replied/converted yet
      setWhatsappSentToday(
        (waSent.messages || [])
          .filter(m => {
            const sentOn = (m.sent_at || m.created_at || '').slice(0, 10)
            return sentOn === todayStr && m.leads?.status === 'outreach_sent'
          })
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
      showToast('Messages ready!')
    }
  }, [queue.length, whatsappQueue.length, generating])

  const markWASent = async (id) => {
    await outreachApi.markSent(id)
    showToast('Marked as sent — check "Sent Today" below')
    await load()
  }

  const logReply = async (message_id, reply_text) => {
    await outreachApi.logReply(message_id, reply_text)
    showToast('Reply logged! Lead moved to Replied 🔥')
    await load()
  }

  const approve = async (id) => {
    try { await outreachApi.approve(id); showToast('Sent!'); load() }
    catch (e) { showToast(e.message, 'error') }
  }

  const reject = async (id) => {
    try { await outreachApi.reject(id); showToast('Rejected'); load() }
    catch (e) { showToast(e.message, 'error') }
  }

  const sendAll = async () => {
    if (!confirm(`Send all ${queue.length} emails now?`)) return
    try { await outreachApi.sendAllApproved(); showToast('Sending…'); setTimeout(load, 2000) }
    catch (e) { showToast(e.message, 'error') }
  }

  const writeOutreach = async () => {
    setGenerating(true)
    try {
      await agents.run('outreach_writer')
      showToast('Writing emails in background — auto-refreshing…')
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        attempts++; await load()
        if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) }
      }, 5000)
    } catch (e) { showToast(e.message, 'error'); setGenerating(false) }
  }

  const generateInstagram = async () => {
    try { await agents.run('instagram_campaign'); showToast('Generating Instagram DMs…'); setTimeout(load, 3000) }
    catch (e) { showToast(e.message, 'error') }
  }

  const waTotal = whatsappQueue.length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>{toast.msg}</div>
      )}

      {generating && (
        <div className="bg-gold/10 border border-gold/30 rounded-xl px-4 py-3 text-sm text-gold flex items-center gap-2">
          <span className="animate-pulse">●</span> Writing in background — auto-refreshing every 5s
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Outreach</h1>
          <p className="text-white/40 text-sm mt-0.5">Review and send your messages</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} disabled={loading} className="btn-ghost text-xs">{loading ? 'Loading…' : '↻ Refresh'}</button>
          <button onClick={writeOutreach} disabled={generating} className="btn-ghost text-xs">{generating ? '✍️ Writing…' : '✍️ Write Emails'}</button>
          {tab === 'whatsapp' && (
            <button onClick={async () => { await outreachApi.clearInvalidWhatsapp(); showToast('Cleared invalid'); load() }}
                    className="btn-ghost text-xs text-red-400/60 hover:text-red-400">🗑 Clear Invalid</button>
          )}
          {tab === 'queue' && queue.length > 0 && (
            <button onClick={sendAll} className="btn-gold text-xs">Send All ({queue.length})</button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'WA to Send', value: whatsappQueue.length, warn: whatsappQueue.length > 0 },
            { label: 'Sent Today', value: whatsappSentToday.length, warn: false },
            { label: 'Emails Today', value: `${stats.emails_sent_today}/${stats.email_limit}`, warn: stats.emails_sent_today >= stats.email_limit },
            { label: 'Email Queue', value: queue.length, warn: false },
          ].map(s => (
            <div key={s.label} className={`card p-3 rounded-xl text-center ${s.warn ? 'border-gold/20' : ''}`}>
              <div className={`text-xl font-bold ${s.warn ? 'text-gold' : 'text-white/60'}`}>{s.value}</div>
              <div className="text-white/40 text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-2 rounded-lg p-1 w-fit flex-wrap">
        {[
          { key: 'whatsapp',  label: `💬 WhatsApp (${waTotal})` },
          { key: 'instagram', label: `📸 Instagram (${instagramQueue.length})` },
          { key: 'queue',     label: `📧 Email (${queue.length})` },
          { key: 'history',   label: `History (${history.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                    tab === t.key ? 'bg-gold text-black' : 'text-white/50 hover:text-white'
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-white/30 text-sm text-center py-12">Loading…</div>
      ) : tab === 'whatsapp' ? (
        <div className="space-y-6">
          {/* Queue to send */}
          {whatsappQueue.length === 0 ? (
            <div className="card rounded-xl p-12 text-center">
              <div className="text-4xl mb-3">💬</div>
              <div className="text-white/40 text-sm">No WhatsApp messages queued.</div>
              <div className="text-white/25 text-xs mt-2">Run "WhatsApp Campaign" from the Dashboard to generate messages.</div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-white/30 font-medium uppercase tracking-wider">
                Ready to send — {whatsappQueue.length} message{whatsappQueue.length !== 1 ? 's' : ''}
              </p>
              {whatsappQueue.map(msg => (
                <WhatsAppCard key={msg.id} msg={msg} onMarkSent={markWASent} />
              ))}
            </div>
          )}

          {/* Sent today — waiting for reply */}
          {whatsappSentToday.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-white/30 font-medium uppercase tracking-wider">
                Sent today — waiting for reply ({whatsappSentToday.length})
              </p>
              {whatsappSentToday.map(msg => (
                <WhatsAppSentCard key={msg.id} msg={msg} onLogReply={logReply} />
              ))}
            </div>
          )}
        </div>
      ) : tab === 'instagram' ? (
        instagramQueue.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📸</div>
            <div className="text-white/40 text-sm mb-4">No Instagram DM scripts generated yet.</div>
            <button onClick={generateInstagram} className="btn-gold text-sm">Generate Instagram DMs</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-white/30">{instagramQueue.length} scripts ready — copy and send manually.</p>
            {instagramQueue.map(msg => <InstagramCard key={msg.id} msg={msg} />)}
          </div>
        )
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <div className="card rounded-xl p-12 text-center">
            <div className="text-4xl mb-3">📤</div>
            <div className="text-white/40 text-sm">Email queue is empty.</div>
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
