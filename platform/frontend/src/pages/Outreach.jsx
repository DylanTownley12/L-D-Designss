import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { outreach as outreachApi, agents } from '../api/client'
import { MessageCircle, Mail, AtSign, RefreshCcw, Trash2, CheckCircle2, X, Send, Clock, Copy, ExternalLink, Zap, Target, TrendingUp, AlertCircle } from 'lucide-react'

const C = {
  bg:        '#02020e',
  panel:     'rgba(0, 8, 28, 0.7)',
  border:    'rgba(0, 212, 255, 0.1)',
  borderDim: 'rgba(0, 212, 255, 0.06)',
  cyan:      '#00D4FF',
  gold:      '#D4A843',
  green:     '#00FF88',
  red:       '#FF3355',
  purple:    '#a855f7',
  text:      'rgba(255,255,255,0.88)',
  textMid:   'rgba(255,255,255,0.42)',
  textDim:   'rgba(255,255,255,0.16)',
  mono:      '"JetBrains Mono", monospace',
}
const lbl = (x = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...x })
const card = (accent = C.border) => ({
  background: C.panel, border: `1px solid ${accent}`, borderRadius: 12,
  overflow: 'hidden', boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
})

const Instagram = AtSign

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 9999,
      padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      background: toast.type === 'error' ? 'rgba(255,51,85,0.9)' : `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
      color: toast.type === 'error' ? 'white' : '#000',
    }}>{toast.msg}</div>
  )
}

function MissionBar({ waQueue, waSentToday, igQueue, igSentToday, waTarget = 15, igTarget = 15 }) {
  const waProgress = Math.min((waSentToday / waTarget) * 100, 100)
  const igProgress = Math.min((igSentToday / igTarget) * 100, 100)
  const waRemaining = Math.max(waTarget - waSentToday, 0)
  const igRemaining = Math.max(igTarget - igSentToday, 0)
  const allDone = waRemaining === 0 && igRemaining === 0

  return (
    <div style={{
      background: allDone ? 'rgba(0,255,136,0.05)' : 'rgba(212,168,67,0.05)',
      border: `1px solid ${allDone ? 'rgba(0,255,136,0.2)' : 'rgba(212,168,67,0.2)'}`,
      borderRadius: 12, padding: '14px 18px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Target size={13} color={allDone ? C.green : C.gold} />
        <span style={lbl({ color: allDone ? C.green : C.gold })}>Today's Mission</span>
        {allDone && <span style={{ marginLeft: 'auto', fontSize: 11, color: C.green, fontWeight: 700 }}>✓ All done today</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'WhatsApp', sent: waSentToday, target: waTarget, remaining: waRemaining, progress: waProgress, color: '#25D366', queue: waQueue },
          { label: 'Instagram', sent: igSentToday, target: igTarget, remaining: igRemaining, progress: igProgress, color: C.purple, queue: igQueue },
        ].map(ch => (
          <div key={ch.label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{ch.label}</span>
              <span style={{ fontSize: 11, fontFamily: C.mono, color: ch.progress >= 100 ? C.green : C.textMid }}>
                {ch.sent}/{ch.target}
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 99, overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ height: '100%', width: `${ch.progress}%`, background: ch.progress >= 100 ? C.green : ch.color, borderRadius: 99, transition: 'width 0.5s ease', boxShadow: `0 0 8px ${ch.color}60` }} />
            </div>
            <div style={{ fontSize: 10, color: C.textDim }}>
              {ch.progress >= 100 ? 'Done ✓' : `${ch.remaining} left to send · ${ch.queue} queued`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NextUp({ msg, onMarkSent, onMarkIGSent, channel }) {
  if (!msg) return null
  const phone = channel === 'whatsapp' ? (msg.leads?.phone || '').replace(/[\s\-\+]/g, '').replace(/^0/, '44') : null
  const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.body)}` : null
  const igUrl = msg.leads?.instagram_url
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    setSending(true)
    try {
      if (channel === 'whatsapp' && waLink) {
        window.open(waLink, '_blank')
        await onMarkSent(msg.id)
      } else if (channel === 'instagram') {
        navigator.clipboard.writeText(msg.body)
        window.open(igUrl || 'https://www.instagram.com/direct/new/', '_blank')
        await onMarkIGSent(msg.id)
      }
    } finally { setSending(false) }
  }

  const color = channel === 'whatsapp' ? '#25D366' : C.purple

  return (
    <div style={{
      background: `linear-gradient(135deg, ${color}12, #02020e)`,
      border: `1px solid ${color}40`, borderRadius: 14, overflow: 'hidden',
      boxShadow: `0 0 24px ${color}15`, marginBottom: 18,
    }}>
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Zap size={11} color={color} />
        <span style={lbl({ color })}>Next Up — Send This Now</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>
          {msg.leads?.business_name} · {msg.leads?.city}
        </span>
      </div>
      <div style={{ padding: '14px 16px' }}>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.65, margin: 0, whiteSpace: 'pre-wrap' }}>{msg.body}</p>
      </div>
      <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
        <button onClick={handleSend} disabled={sending || (channel === 'whatsapp' && !waLink)} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '11px', borderRadius: 10, border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          color: 'white', fontSize: 13.5, fontWeight: 700,
          boxShadow: `0 4px 16px ${color}40`, opacity: sending ? 0.6 : 1,
        }}>
          {channel === 'whatsapp'
            ? <><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg></>
            : <Instagram size={16} />
          }
          {sending ? 'Opening...' : channel === 'whatsapp' ? (waLink ? 'Open WhatsApp & mark sent' : 'No phone number') : igUrl ? 'Open Instagram & mark sent' : 'Copy & open Instagram DMs'}
        </button>
      </div>
    </div>
  )
}

function WhatsAppCard({ msg, onMarkSent, isFirst }) {
  const [sending, setSending] = useState(false)
  const phone = (msg.leads?.phone || '').replace(/[\s\-\+]/g, '').replace(/^0/, '44')
  const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg.body)}` : null
  const hasUrl = /https?:\/\//.test(msg.body)

  const handleSend = async () => {
    if (!waLink) return
    window.open(waLink, '_blank')
    setSending(true)
    try { await onMarkSent(msg.id) } finally { setSending(false) }
  }

  return (
    <div style={{ ...card('rgba(37,211,102,0.15)'), opacity: isFirst ? 0.4 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{msg.leads?.business_name || 'Unknown'}</span>
          <span style={{ fontSize: 11, color: C.textDim, marginLeft: 8 }}>{msg.leads?.city}</span>
          {msg.leads?.phone && <span style={{ fontSize: 10.5, color: C.textDim, marginLeft: 8, fontFamily: C.mono }}>{msg.leads.phone}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {hasUrl && <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(212,168,67,0.1)', color: C.gold, border: '1px solid rgba(212,168,67,0.2)' }}>preview link</span>}
          {isFirst && <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(37,211,102,0.1)', color: '#25D366', border: '1px solid rgba(37,211,102,0.2)' }}>↑ sent above</span>}
        </div>
      </div>
      <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{msg.body}</p>
      </div>
      <div style={{ padding: '10px 16px' }}>
        {waLink
          ? <button onClick={handleSend} disabled={sending} style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '10px', borderRadius: 8, border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
              background: 'linear-gradient(135deg, #25D366, #128C7E)', color: 'white',
              fontSize: 13, fontWeight: 600, opacity: sending ? 0.6 : 1,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {sending ? 'Opening...' : 'Open WhatsApp — mark sent'}
            </button>
          : <div style={{ textAlign: 'center', fontSize: 12, color: 'rgba(239,68,68,0.5)', padding: '6px 0' }}>No mobile number</div>
        }
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
    <div style={{ ...card(), background: 'rgba(0,0,0,0.3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{msg.leads?.business_name}</span>
            <span style={{ fontSize: 11, color: C.textDim }}>{msg.leads?.city}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', fontWeight: 600 }}>sent</span>
          </div>
          <div style={{ fontSize: 11, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg.body}</div>
        </div>
      </div>
      {replying ? (
        <div style={{ padding: '10px 14px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <textarea autoFocus rows={3} value={replyText} onChange={e => setReplyText(e.target.value)}
            placeholder="What did they say?"
            style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'white', resize: 'none', outline: 'none', marginBottom: 8, boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={!replyText.trim() || saving} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
              <CheckCircle2 size={12} /> {saving ? 'Saving...' : 'Log Reply'}
            </button>
            <button onClick={() => { setReplying(false); setReplyText('') }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: C.textMid, cursor: 'pointer', fontSize: 12 }}>
              <X size={12} />
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: '0 14px 10px', paddingTop: 8 }}>
          <button onClick={() => setReplying(true)} style={{ width: '100%', padding: '7px', fontSize: 11, color: C.textDim, background: 'none', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, cursor: 'pointer' }}>
            Got a reply? Log it →
          </button>
        </div>
      )}
    </div>
  )
}

function InstagramCard({ msg, onMarkSent, isFirst }) {
  const [sending, setSending] = useState(false)
  const igUrl = msg.leads?.instagram_url
  const handleSend = async () => {
    navigator.clipboard.writeText(msg.body)
    window.open(igUrl || 'https://www.instagram.com/direct/new/', '_blank')
    setSending(true)
    try { if (onMarkSent) await onMarkSent(msg.id) } finally { setSending(false) }
  }
  return (
    <div style={{ ...card('rgba(168,85,247,0.15)'), opacity: isFirst ? 0.4 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{msg.leads?.business_name || 'Unknown'}</span>
          <span style={{ fontSize: 11, color: C.textDim, marginLeft: 8 }}>{msg.leads?.city}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {igUrl
            ? <a href={igUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: C.purple, textDecoration: 'none' }}>{igUrl.replace(/https?:\/\/(www\.)?instagram\.com\//, '@').replace(/\/$/, '')}</a>
            : <span style={{ fontSize: 9.5, color: 'rgba(168,85,247,0.4)', fontStyle: 'italic' }}>Search on Instagram</span>
          }
          {isFirst && <span style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(168,85,247,0.1)', color: C.purple, border: '1px solid rgba(168,85,247,0.2)' }}>↑ sent above</span>}
        </div>
      </div>
      <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.15)' }}>
        <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: 0 }}>{msg.body}</p>
      </div>
      <div style={{ padding: '10px 16px' }}>
        <button onClick={handleSend} disabled={sending} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px', borderRadius: 8, border: 'none', cursor: sending ? 'not-allowed' : 'pointer',
          background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: 'white',
          fontSize: 13, fontWeight: 600, opacity: sending ? 0.6 : 1,
        }}>
          <Instagram size={14} />
          {sending ? 'Opening...' : igUrl ? 'Open Instagram — mark sent' : 'Copy & open Instagram DMs'}
        </button>
      </div>
    </div>
  )
}

function EmailCard({ msg, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(false)
  const isQueued = msg.status === 'queued'
  return (
    <div style={{ ...card(isQueued ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.06)') }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px' }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(59,130,246,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Mail size={14} color="#60a5fa" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{msg.leads?.business_name}</span>
            <span style={{ fontSize: 11, color: C.textDim }}>{msg.leads?.city}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, padding: '2px 8px', borderRadius: 99, fontWeight: 600, background: isQueued ? 'rgba(245,158,11,0.12)' : 'rgba(107,114,128,0.12)', color: isQueued ? '#fbbf24' : '#9ca3af' }}>{msg.status}</span>
          </div>
          {msg.subject && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Re: {msg.subject}</div>}
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, overflow: expanded ? 'visible' : 'hidden', display: expanded ? 'block' : '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{msg.body}</div>
          <button onClick={() => setExpanded(!expanded)} style={{ fontSize: 10.5, color: C.textDim, background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>{expanded ? '▲ Less' : '▼ More'}</button>
        </div>
      </div>
      {isQueued && (
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 14px' }}>
          <button onClick={() => onApprove(msg.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, color: '#000', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
            <CheckCircle2 size={12} /> Approve & Send
          </button>
          <button onClick={() => onReject(msg.id)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'none', color: C.textMid, fontSize: 12, cursor: 'pointer' }}>
            <X size={12} /> Reject
          </button>
        </div>
      )}
    </div>
  )
}

export default function Outreach() {
  const [queue, setQueue] = useState([])
  const [whatsappQueue, setWhatsappQueue] = useState([])
  const [whatsappSentToday, setWhatsappSentToday] = useState([])
  const [instagramQueue, setInstagramQueue] = useState([])
  const [instagramSentToday, setInstagramSentToday] = useState([])
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [tab, setTab] = useState('whatsapp')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const pollRef = useRef(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3500) }
  const todayStr = new Date().toISOString().slice(0, 10)

  const load = async () => {
    setLoading(true)
    try {
      const [q, wa, waSent, ig, igSent, h, s] = await Promise.all([
        outreachApi.queue('queued'),
        outreachApi.queueByChannel('whatsapp', 'queued,draft'),
        outreachApi.queueByChannel('whatsapp', 'sent'),
        outreachApi.queueByChannel('instagram', 'queued,draft'),
        outreachApi.queueByChannel('instagram', 'sent'),
        outreachApi.history(50),
        outreachApi.statsToday(),
      ])
      setQueue((q.messages || []).filter(m => m.channel === 'email'))
      setWhatsappQueue(wa.messages || [])
      setInstagramQueue(ig.messages || [])
      setHistory(h.messages || [])
      setStats(s)
      const todayWA = (waSent.messages || []).filter(m => (m.sent_at || m.created_at || '').slice(0, 10) === todayStr)
      const todayIG = (igSent.messages || []).filter(m => (m.sent_at || m.created_at || '').slice(0, 10) === todayStr)
      setWhatsappSentToday(todayWA.reverse())
      setInstagramSentToday(todayIG)
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    if (searchParams.get('generating') === '1') {
      setGenerating(true); setSearchParams({}, { replace: true })
      let attempts = 0
      pollRef.current = setInterval(async () => { attempts++; await load(); if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) } }, 5000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const markWASent = async id => { await outreachApi.markSent(id); showToast('Marked sent'); await load() }
  const markIGSent = async id => { await outreachApi.markSent(id); showToast('Marked sent'); await load() }
  const logReply = async (id, text) => { await outreachApi.logReply(id, text); showToast('Reply logged!'); await load() }
  const approve = async id => { try { await outreachApi.approve(id); showToast('Sent!'); load() } catch (e) { showToast(e.message, 'error') } }
  const reject = async id => { try { await outreachApi.reject(id); showToast('Rejected'); load() } catch (e) { showToast(e.message, 'error') } }
  const sendAll = async () => {
    if (!confirm(`Send all ${queue.length} emails?`)) return
    try { await outreachApi.sendAllApproved(); showToast('Sending...'); setTimeout(load, 2000) } catch (e) { showToast(e.message, 'error') }
  }
  const generateWA = async () => {
    setGenerating(true)
    try {
      const res = await agents.run('whatsapp_campaign')
      if (res?.capped || res?.pending > 0) { showToast(`${res.pending || whatsappQueue.length} messages already queued`, 'success'); setGenerating(false); return }
      showToast('Generating...')
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => { attempts++; await load(); if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) } }, 5000)
    } catch (e) { showToast(e.message, 'error'); setGenerating(false) }
  }
  const generateIG = async () => {
    try { await agents.run('instagram_campaign'); showToast('Generating Instagram DMs...'); setTimeout(load, 3000) }
    catch (e) { showToast(e.message, 'error') }
  }
  const writeEmails = async () => {
    setGenerating(true)
    try {
      await agents.run('outreach_writer'); showToast('Writing emails...')
      let attempts = 0
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => { attempts++; await load(); if (attempts >= 12) { clearInterval(pollRef.current); setGenerating(false) } }, 5000)
    } catch (e) { showToast(e.message, 'error'); setGenerating(false) }
  }

  const tabs = [
    { key: 'whatsapp',  Icon: MessageCircle, label: 'WhatsApp',  count: whatsappQueue.length, color: '#25D366' },
    { key: 'instagram', Icon: Instagram,     label: 'Instagram', count: instagramQueue.length, color: C.purple },
    { key: 'queue',     Icon: Mail,          label: 'Email',     count: queue.length, color: '#60a5fa' },
    { key: 'history',   Icon: Clock,         label: 'History',   count: history.length, color: C.textDim },
  ]

  const nextWA = whatsappQueue[0] || null
  const nextIG = instagramQueue[0] || null

  return (
    <div style={{ padding: '24px', maxWidth: 860, margin: '0 auto' }}>
      <Toast toast={toast} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={lbl()}>DAILY MISSION BOARD</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Outreach</h1>
        </div>
        <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
          <RefreshCcw size={12} /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Mission Bar */}
      <MissionBar
        waQueue={whatsappQueue.length}
        waSentToday={whatsappSentToday.length}
        igQueue={instagramQueue.length}
        igSentToday={instagramSentToday.length}
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'rgba(0,8,28,0.5)', border: `1px solid ${C.borderDim}`, borderRadius: 10, padding: 4, marginBottom: 18, flexWrap: 'wrap', width: 'fit-content' }}>
        {tabs.map(t => {
          const Icon = t.Icon
          const isActive = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7,
              fontSize: 12.5, fontWeight: 500, border: 'none', cursor: 'pointer',
              background: isActive ? `linear-gradient(135deg, ${C.gold}, #F0C96A)` : 'transparent',
              color: isActive ? '#000' : C.textMid, fontFamily: 'Inter, sans-serif',
            }}>
              <Icon size={12} />
              {t.label}
              <span style={{ fontSize: 10, fontWeight: 700, background: isActive ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.06)', color: isActive ? '#000' : 'rgba(255,255,255,0.35)', padding: '1px 6px', borderRadius: 99 }}>
                {t.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Generate buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {tab === 'whatsapp' && (
          <>
            <button onClick={generateWA} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, border: 'none', color: '#000', fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: generating ? 'not-allowed' : 'pointer' }}>
              <MessageCircle size={12} /> {generating ? 'Generating...' : 'Generate WhatsApp'}
            </button>
            <button onClick={async () => { await outreachApi.clearInvalidWhatsapp(); showToast('Cleared'); load() }} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'transparent', border: `1px solid rgba(255,51,85,0.25)`, color: 'rgba(255,51,85,0.6)', padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>
              <Trash2 size={12} /> Clear Invalid
            </button>
          </>
        )}
        {tab === 'instagram' && (
          <button onClick={generateIG} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'linear-gradient(135deg, #a855f7, #7c3aed)', border: 'none', color: '#fff', fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
            <Instagram size={12} /> Generate Instagram DMs
          </button>
        )}
        {tab === 'queue' && (
          <>
            <button onClick={writeEmails} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}>
              {generating ? 'Writing...' : 'Write Emails'}
            </button>
            {queue.length > 0 && (
              <button onClick={sendAll} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, border: 'none', color: '#000', fontWeight: 700, padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
                <Send size={12} /> Send All ({queue.length})
              </button>
            )}
          </>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.textDim, padding: '48px 0', fontSize: 13 }}>Loading...</div>
      ) : tab === 'whatsapp' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {whatsappQueue.length === 0 ? (
            <div style={{ ...card(), padding: '48px 24px', textAlign: 'center' }}>
              <MessageCircle size={28} color="rgba(37,211,102,0.3)" style={{ margin: '0 auto 14px', display: 'block' }} />
              <div style={{ fontSize: 14, color: C.textMid, marginBottom: 16 }}>No WhatsApp messages queued</div>
              <button onClick={generateWA} disabled={generating} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, color: '#000', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {generating ? 'Generating...' : 'Generate WhatsApp Messages'}
              </button>
            </div>
          ) : (
            <>
              <NextUp msg={nextWA} onMarkSent={markWASent} onMarkIGSent={markIGSent} channel="whatsapp" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={lbl({ marginBottom: 4 })}>{whatsappQueue.length} queued — remaining messages</p>
                {whatsappQueue.map((msg, i) => <WhatsAppCard key={msg.id} msg={msg} onMarkSent={markWASent} isFirst={i === 0} />)}
              </div>
            </>
          )}
          {whatsappSentToday.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={lbl({ marginBottom: 4 })}>Sent today — waiting for reply ({whatsappSentToday.length})</p>
              {whatsappSentToday.map(msg => <WhatsAppSentCard key={msg.id} msg={msg} onLogReply={logReply} />)}
            </div>
          )}
        </div>
      ) : tab === 'instagram' ? (
        instagramQueue.length === 0 ? (
          <div style={{ ...card(), padding: '48px 24px', textAlign: 'center' }}>
            <Instagram size={28} color="rgba(168,85,247,0.3)" style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 14, color: C.textMid, marginBottom: 16 }}>No Instagram scripts yet</div>
            <button onClick={generateIG} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #a855f7, #7c3aed)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Generate Instagram DMs
            </button>
          </div>
        ) : (
          <>
            <NextUp msg={nextIG} onMarkSent={markWASent} onMarkIGSent={markIGSent} channel="instagram" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={lbl({ marginBottom: 4 })}>{instagramQueue.length} scripts ready — remaining</p>
              {instagramQueue.map((msg, i) => <InstagramCard key={msg.id} msg={msg} onMarkSent={markIGSent} isFirst={i === 0} />)}
            </div>
          </>
        )
      ) : tab === 'queue' ? (
        queue.length === 0 ? (
          <div style={{ ...card(), padding: '48px 24px', textAlign: 'center' }}>
            <Mail size={28} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 14, color: C.textMid }}>Email queue is empty</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queue.map(msg => <EmailCard key={msg.id} msg={msg} onApprove={approve} onReject={reject} />)}
          </div>
        )
      ) : (
        history.length === 0 ? (
          <div style={{ ...card(), padding: '48px 24px', textAlign: 'center' }}>
            <Clock size={28} color="rgba(255,255,255,0.1)" style={{ margin: '0 auto 14px', display: 'block' }} />
            <div style={{ fontSize: 14, color: C.textMid }}>No messages sent yet</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {history.map(msg => <EmailCard key={msg.id} msg={msg} onApprove={approve} onReject={reject} />)}
          </div>
        )
      )}
    </div>
  )
}
