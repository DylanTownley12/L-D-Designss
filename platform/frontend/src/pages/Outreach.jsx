import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { outreach as outreachApi, agents, instagram as instagramApi } from '../api/client'
import { MessageCircle, Mail, AtSign, RefreshCcw, Trash2, CheckCircle2, X, Send, Clock, Copy, ExternalLink } from 'lucide-react'

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

const Instagram = AtSign

function MessageBody({ text }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g
  const parts = text.split(urlRegex)
  return (
    <span>
      {parts.map((part, i) =>
        urlRegex.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer"
             style={{ color: '#D4A843', textDecoration: 'underline', wordBreak: 'break-all', fontWeight: 500 }}>
            {part}
          </a>
        ) : <span key={i}>{part}</span>
      )}
    </span>
  )
}

function WhatsAppCard({ msg, onMarkSent }) {
  const [sending, setSending] = useState(false)
  const phone = (msg.leads?.phone || '').replace(/[\s\-\+]/g, '').replace(/^0/, '44')
  const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.body)}` : null
  const hasUrl = /https?:\/\//.test(msg.body)

  const handleOpenWA = async () => {
    if (!waLink) return
    window.open(waLink, '_blank')
    setSending(true)
    try { await onMarkSent(msg.id) } finally { setSending(false) }
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, #0c0c12 100%)',
      border: '1px solid rgba(16,185,129,0.18)',
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        padding: '14px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 3 }}>
            {msg.leads?.business_name || 'Unknown'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{msg.leads?.city}</span>
            {msg.leads?.phone && (
              <><span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}>{msg.leads.phone}</span></>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {hasUrl && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(212,168,67,0.12)', color: '#D4A843',
              border: '1px solid rgba(212,168,67,0.22)',
            }}>✓ preview link</span>
          )}
          <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.22)', fontFamily: '"JetBrains Mono", monospace' }}>
            {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </span>
        </div>
      </div>

      <div style={{ padding: '14px 18px', background: 'rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
          <MessageBody text={msg.body} />
        </p>
      </div>

      <div style={{ padding: '12px 18px' }}>
        {waLink ? (
          <button
            onClick={handleOpenWA}
            disabled={sending}
            style={{
              width: '100%',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              padding: '12px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #25D366, #128C7E)',
              border: 'none',
              color: 'white',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: sending ? 'not-allowed' : 'pointer',
              opacity: sending ? 0.6 : 1,
              boxShadow: '0 2px 12px rgba(37,211,102,0.25)',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            {sending ? 'Opening...' : 'Open WhatsApp — mark as sent'}
          </button>
        ) : (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(239,68,68,0.6)', padding: '8px 0' }}>
            No mobile number — can't send via WhatsApp
          </div>
        )}
      </div>
    </div>
  )
}

function WhatsAppSentCard({ msg, onLogReply }) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!replyText.trim()) return
    setSaving(true)
    try { await onLogReply(msg.id, replyText.trim()); setReplying(false); setReplyText('') }
    finally { setSaving(false) }
  }

  return (
    <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.75)' }}>{msg.leads?.business_name || 'Unknown'}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{msg.leads?.city}</span>
            <span style={{
              marginLeft: 'auto',
              fontSize: 10, padding: '2px 8px', borderRadius: 99,
              background: 'rgba(16,185,129,0.15)', color: '#6ee7b7', fontWeight: 600,
            }}>sent</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.28)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.body}</div>
        </div>
      </div>
      {replying ? (
        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <textarea
            autoFocus
            style={{
              width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'white', resize: 'none',
              outline: 'none', fontFamily: 'Inter, sans-serif', marginBottom: 8, boxSizing: 'border-box',
            }}
            rows={3}
            placeholder="What did they say?"
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={!replyText.trim() || saving} className="btn-gold" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
              <CheckCircle2 size={12} /> {saving ? 'Saving...' : 'Log Reply'}
            </button>
            <button onClick={() => { setReplying(false); setReplyText('') }} className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }}>
              <X size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 14px 10px', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
          <button
            onClick={() => setReplying(true)}
            style={{
              width: '100%', padding: '7px', fontSize: 11.5, color: 'rgba(255,255,255,0.3)',
              background: 'none', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, cursor: 'pointer',
              transition: 'all 0.15s', fontFamily: 'Inter, sans-serif',
            }}
          >
            Got a reply? Log it →
          </button>
        </div>
      )}
    </div>
  )
}

function MessageCard({ msg, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const isQueued = msg.status === 'queued'
  return (
    <div style={{
      background: isQueued ? 'linear-gradient(135deg, rgba(212,168,67,0.06) 0%, #0c0c12 100%)' : '#0c0c12',
      border: `1px solid ${isQueued ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: msg.channel === 'email' ? 'rgba(59,130,246,0.12)' : 'rgba(37,211,102,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {msg.channel === 'email' ? <Mail size={15} color="#60a5fa" /> : <MessageCircle size={15} color="#34d399" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{msg.leads?.business_name || 'Unknown'}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{msg.leads?.city}</span>
            <span style={{
              marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 99, fontWeight: 600,
              background: msg.status === 'queued' ? 'rgba(245,158,11,0.15)' : msg.status === 'sent' ? 'rgba(16,185,129,0.15)' : 'rgba(107,114,128,0.15)',
              color: msg.status === 'queued' ? '#fbbf24' : msg.status === 'sent' ? '#6ee7b7' : '#9ca3af',
            }}>
              {msg.status}
            </span>
          </div>
          {msg.subject && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 6, fontWeight: 500 }}>Re: {msg.subject}</div>}
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, overflow: expanded ? 'visible' : 'hidden', display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {msg.body}
          </div>
          <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>
            {expanded ? '▲ Less' : '▼ More'}
          </button>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
            Day {msg.sequence_day || 1} · {new Date(msg.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </div>
        </div>
      </div>
      {isQueued && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button onClick={() => onApprove(msg.id)} className="btn-gold" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
            <CheckCircle2 size={12} /> Approve & Send
          </button>
          <button onClick={() => onReject(msg.id)} className="btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
            <X size={12} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

function InstagramCard({ msg }) {
  const [copied, setCopied] = useState(false)
  const igUrl = msg.leads?.instagram_url
  const copy = () => { navigator.clipboard.writeText(msg.body); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  return (
    <div style={{
      background: 'linear-gradient(135deg, rgba(168,85,247,0.07) 0%, #0c0c12 100%)',
      border: '1px solid rgba(168,85,247,0.2)',
      borderRadius: 12,
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Instagram size={15} color="#c084fc" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{msg.leads?.business_name || 'Unknown'}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{msg.leads?.city}</span>
            {igUrl
              ? <a href={igUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', fontSize: 11, color: '#c084fc', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{igUrl.replace(/https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}</a>
              : <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(168,85,247,0.5)', fontStyle: 'italic' }}>Search "{msg.leads?.business_name}" on Instagram</span>
            }
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '10px 12px' }}>{msg.body}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {igUrl && (
          <a href={igUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost" style={{ flex: 1, justifyContent: 'center', fontSize: 12, color: '#c084fc', textDecoration: 'none' }}>
            <ExternalLink size={11} /> Open Instagram
          </a>
        )}
        <button onClick={copy} className="btn-gold" style={{ flex: 1, justifyContent: 'center', fontSize: 12 }}>
          {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy DM</>}
        </button>
      </div>
    </div>
  )
}

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
      setWhatsappSentToday(
        (waSent.messages || [])
          .filter(m => { const sentOn = (m.sent_at || m.created_at || '').slice(0, 10); return sentOn === todayStr && m.leads?.status === 'outreach_sent' })
          .reverse()
      )
      setInstagramQueue(ig.messages || [])
      setHistory(h.messages || [])
      setStats(s)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
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
      clearInterval(pollRef.current); setGenerating(false); showToast('Messages ready!')
    }
  }, [queue.length, whatsappQueue.length, generating])

  const markWASent = async id => { await outreachApi.markSent(id); showToast('Marked as sent'); await load() }
  const logReply = async (message_id, reply_text) => { await outreachApi.logReply(message_id, reply_text); showToast('Reply logged!'); await load() }
  const approve = async id => { try { await outreachApi.approve(id); showToast('Sent!'); load() } catch (e) { showToast(e.message, 'error') } }
  const reject = async id => { try { await outreachApi.reject(id); showToast('Rejected'); load() } catch (e) { showToast(e.message, 'error') } }
  const sendAll = async () => {
    if (!confirm(`Send all ${queue.length} emails now?`)) return
    try { await outreachApi.sendAllApproved(); showToast('Sending...'); setTimeout(load, 2000) } catch (e) { showToast(e.message, 'error') }
  }
  const writeOutreach = async () => {
    setGenerating(true)
    try {
      await agents.run('outreach_writer')
      showToast('Writing emails in background...')
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => { attempts++; await load(); if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) } }, 5000)
    } catch (e) { showToast(e.message, 'error'); setGenerating(false) }
  }
  const generateWhatsApp = async () => {
    setGenerating(true)
    try {
      const res = await agents.run('whatsapp_campaign')
      if (res?.data?.capped || res?.data?.pending > 0) {
        showToast(`${res.data.pending || whatsappQueue.length} messages already queued — Baz sends 10/day`, 'success')
        setGenerating(false)
        return
      }
      showToast('Generating WhatsApp messages...')
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => { attempts++; await load(); if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) } }, 5000)
    } catch (e) { showToast(e.message, 'error'); setGenerating(false) }
  }
  const generateInstagram = async () => {
    try {
      await agents.run('instagram_campaign')
      showToast('Generating Instagram DMs...')
      setTimeout(load, 3000)
    } catch (e) { showToast(e.message, 'error') }
  }

  const tabs = [
    { key: 'whatsapp',  Icon: MessageCircle, label: 'WhatsApp',  count: whatsappQueue.length },
    { key: 'instagram', Icon: Instagram,     label: 'Instagram', count: instagramQueue.length },
    { key: 'queue',     Icon: Mail,          label: 'Email',     count: queue.length },
    { key: 'history',   Icon: Clock,         label: 'History',   count: history.length },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
          color: toast.type === 'error' ? 'white' : 'black',
        }}>
          {toast.msg}
        </div>
      )}

      {generating && (
        <div style={{
          background: `rgba(212,168,67,0.06)`, border: `1px solid rgba(212,168,67,0.25)`,
          borderRadius: 10, padding: '10px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.gold,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.gold, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
          Writing in background — auto-refreshing every 5s
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={label()}>OUTREACH COMMAND</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>Outreach</h1>
          <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>Review and deploy messages</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
            <RefreshCcw size={12} /> {loading ? 'Loading...' : 'Refresh'}
          </button>
          {tab === 'whatsapp' && (
            <>
              <button onClick={generateWhatsApp} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, border: 'none', color: '#000', fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: generating ? 'not-allowed' : 'pointer' }}>
                <MessageCircle size={12} /> {generating ? 'Generating...' : 'Generate WhatsApp'}
              </button>
              <button onClick={async () => { await outreachApi.clearInvalidWhatsapp(); showToast('Cleared invalid'); load() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'transparent', border: `1px solid ${C.red}30`, color: `${C.red}80`, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
                <Trash2 size={12} /> Clear Invalid
              </button>
            </>
          )}
          {tab === 'queue' && (
            <>
              <button onClick={writeOutreach} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
                {generating ? 'Writing...' : 'Write Emails'}
              </button>
              {queue.length > 0 && (
                <button onClick={sendAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, border: 'none', color: '#000', fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer' }}>
                  <Send size={12} /> Send All ({queue.length})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { lbl: 'WA to Send',   value: whatsappQueue.length, color: C.green },
            { lbl: 'Sent Today',   value: whatsappSentToday.length, color: C.gold },
            { lbl: 'Emails Today', value: `${stats.emails_sent_today}/${stats.email_limit}`, color: C.cyan },
            { lbl: 'Email Queue',  value: queue.length, color: '#a855f7' },
          ].map(s => (
            <div key={s.lbl} style={{ ...panel({ padding: '12px 14px', textAlign: 'center', position: 'relative', overflow: 'hidden' }) }}>
              <div style={{ ...label(), marginBottom: 5, fontSize: 7.5 }}>{s.lbl}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: C.mono, letterSpacing: '-0.02em', textShadow: `0 0 16px ${s.color}50` }}>{s.value}</div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, background: `radial-gradient(circle at 100% 100%, ${s.color}12 0%, transparent 70%)`, pointerEvents: 'none' }} />
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4,
        background: `rgba(0,8,28,0.5)`,
        border: `1px solid ${C.borderDim}`,
        borderRadius: 10,
        padding: 4,
        width: 'fit-content',
        marginBottom: 18,
        flexWrap: 'wrap',
      }}>
        {tabs.map(t => {
          const Icon = t.Icon
          const isActive = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 7,
                fontSize: 12.5, fontWeight: 500,
                border: 'none', cursor: 'pointer',
                background: isActive ? `linear-gradient(135deg, ${C.gold}, #F0C96A)` : 'transparent',
                color: isActive ? '#000' : C.textMid,
                transition: 'all 0.15s ease',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <Icon size={12} />
              {t.label}
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.08)',
                color: isActive ? '#000' : 'rgba(255,255,255,0.4)',
                padding: '1px 6px', borderRadius: 99,
              }}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', padding: '48px 0', fontSize: 13 }}>Loading...</div>
      ) : tab === 'whatsapp' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {whatsappQueue.length === 0 ? (
            <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(37,211,102,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <MessageCircle size={22} color="#25D366" style={{ opacity: 0.7 }} />
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 6, fontWeight: 500 }}>No WhatsApp messages queued</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginBottom: 18 }}>Leads need a preview generated first, then generate below.</div>
              <button onClick={generateWhatsApp} disabled={generating} className="btn-gold" style={{ fontSize: 13 }}>
                {generating ? 'Generating...' : 'Generate WhatsApp Messages'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Ready to send — {whatsappQueue.length} message{whatsappQueue.length !== 1 ? 's' : ''}
              </p>
              {whatsappQueue.map(msg => <WhatsAppCard key={msg.id} msg={msg} onMarkSent={markWASent} />)}
            </div>
          )}
          {whatsappSentToday.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Sent today — waiting for reply ({whatsappSentToday.length})
              </p>
              {whatsappSentToday.map(msg => <WhatsAppSentCard key={msg.id} msg={msg} onLogReply={logReply} />)}
            </div>
          )}
        </div>
      ) : tab === 'instagram' ? (
        instagramQueue.length === 0 ? (
          <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(168,85,247,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Instagram size={22} color="#c084fc" style={{ opacity: 0.7 }} />
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 18, fontWeight: 500 }}>No Instagram scripts yet</div>
            <button onClick={generateInstagram} className="btn-gold">Generate Instagram DMs</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>{instagramQueue.length} scripts ready — copy and send manually.</p>
            {instagramQueue.map(msg => <InstagramCard key={msg.id} msg={msg} />)}
          </div>
        )
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <Mail size={28} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>Email queue is empty</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queue.map(msg => <MessageCard key={msg.id} msg={msg} onApprove={approve} onReject={reject} />)}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '48px 24px', textAlign: 'center' }}>
            <Clock size={28} color="rgba(255,255,255,0.15)" style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontWeight: 500 }}>No messages sent yet</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(msg => <MessageCard key={msg.id} msg={msg} onApprove={approve} onReject={reject} />)}
          </div>
        )
      )}
    </div>
  )
}
