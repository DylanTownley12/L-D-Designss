import { useState, useEffect, useCallback } from 'react'
import { leads as leadsApi, agents, previews as previewsApi, outreach as outreachApi, payments } from '../api/client'
import { Search, RefreshCcw, Play, Globe, Send, XCircle, ChevronLeft, ChevronRight, Flame, CreditCard, MessageSquare, X } from 'lucide-react'

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
const lbl = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panelStyle = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...extra })

const PAGE_SIZE = 50

const STATUS_META = {
  new:             { label: 'New',           bg: 'rgba(107,114,128,0.15)', color: '#9ca3af',  dot: '#6b7280' },
  analyzing:       { label: 'Analysing',     bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa',  dot: '#3b82f6' },
  preview_ready:   { label: 'Preview Ready', bg: 'rgba(168,85,247,0.12)',  color: '#c084fc',  dot: '#a855f7' },
  outreach_queued: { label: 'Queued',        bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24',  dot: '#f59e0b' },
  outreach_sent:   { label: 'Sent',          bg: 'rgba(6,182,212,0.12)',   color: '#22d3ee',  dot: '#06b6d4' },
  replied:         { label: 'Replied',       bg: 'rgba(245,158,11,0.15)',  color: '#fcd34d',  dot: '#f59e0b', bold: true },
  interested:      { label: 'Interested',    bg: 'rgba(168,85,247,0.15)',  color: '#d8b4fe',  dot: '#a855f7', bold: true },
  converted:       { label: 'Client ✓',      bg: 'rgba(16,185,129,0.15)',  color: '#6ee7b7',  dot: '#10b981', bold: true },
  not_interested:  { label: 'Not Interested',bg: 'rgba(239,68,68,0.12)',   color: '#fca5a5',  dot: '#ef4444' },
  do_not_contact:  { label: 'DNC',           bg: 'rgba(127,29,29,0.25)',   color: '#fca5a5',  dot: '#7f1d1d' },
}

const WEBSITE_META = {
  none:    { label: 'No Website',  color: '#34d399' },
  weak:    { label: 'Weak Site',   color: '#fbbf24' },
  decent:  { label: 'Decent',      color: '#60a5fa' },
  good:    { label: 'Good',        color: '#9ca3af' },
  unknown: { label: 'Unknown',     color: '#6b7280' },
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', dot: '#6b7280' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      background: m.bg, fontSize: 11,
      fontWeight: m.bold ? 600 : 500,
      color: m.color, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  )
}

function QualityScore({ score }) {
  const hue = score
  return (
    <div style={{
      width: 36, height: 36, borderRadius: 10,
      background: `hsl(${hue}, 55%, 14%)`,
      border: `1px solid hsl(${hue}, 60%, 28%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: `hsl(${hue}, 75%, 65%)` }}>
        {score}
      </span>
    </div>
  )
}

function relTime(iso) {
  const d = Date.now() - new Date(iso).getTime()
  if (d < 8000) return 'just now'
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  return `${Math.floor(d / 3600000)}h ago`
}

function PaymentStatusBlock({ lead, onPaymentSent }) {
  const [payStatus, setPayStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!lead?.id) return
    payments.getStatus(lead.id)
      .then(setPayStatus)
      .catch(() => setPayStatus(null))
      .finally(() => setLoading(false))
  }, [lead?.id])

  const sendLink = async () => {
    setSending(true)
    try {
      const { checkout_url } = await payments.createCheckout(lead.id)
      window.open(checkout_url, '_blank')
      payments.getStatus(lead.id).then(setPayStatus).catch(() => {})
      onPaymentSent?.()
    } catch (e) {
      alert(e.message)
    } finally {
      setSending(false)
    }
  }

  const isPaid = payStatus?.payment_status === 'paid' || lead?.status === 'converted'
  const isAwaiting = payStatus?.session_id && !isPaid
  const noneYet = !payStatus?.session_id && !isPaid

  const paidDate = payStatus?.created
    ? new Date(payStatus.created * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.borderDim}`, background: isPaid ? 'rgba(0,255,136,0.03)' : 'rgba(212,168,67,0.04)' }}>
      <div style={{ ...lbl(), color: isPaid ? C.green : C.gold, marginBottom: 8, fontSize: 8 }}>
        PAYMENT STATUS
      </div>

      {loading ? (
        <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>CHECKING STRIPE...</div>
      ) : isPaid ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(0,255,136,0.08)', border: `1px solid rgba(0,255,136,0.2)`,
          borderRadius: 9, padding: '11px 14px',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(0,255,136,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CreditCard size={13} color={C.green} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>£75 DEPOSIT PAID</div>
            {paidDate && <div style={{ fontSize: 10, color: `${C.green}80`, marginTop: 1 }}>Received {paidDate} · Build their site now</div>}
          </div>
        </div>
      ) : isAwaiting ? (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(245,158,11,0.08)', border: `1px solid rgba(245,158,11,0.2)`,
            borderRadius: 9, padding: '11px 14px', marginBottom: 8,
          }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CreditCard size={13} color="#fbbf24" />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fbbf24' }}>LINK SENT — AWAITING PAYMENT</div>
              <div style={{ fontSize: 10, color: 'rgba(251,191,36,0.6)', marginTop: 1 }}>Barber has a checkout URL but hasn't paid yet</div>
            </div>
          </div>
          <button
            onClick={sendLink}
            disabled={sending}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              background: 'rgba(212,168,67,0.12)', border: `1px solid rgba(212,168,67,0.3)`,
              color: C.gold, fontWeight: 600, fontSize: 12,
              padding: '9px', borderRadius: 8, cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.6 : 1,
            }}
          >
            <CreditCard size={12} />
            {sending ? 'Creating...' : 'Resend New Link'}
          </button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>No payment link sent yet.</div>
          <button
            onClick={sendLink}
            disabled={sending}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
              color: '#000', fontWeight: 700, fontSize: 13,
              padding: '11px', borderRadius: 9, border: 'none', cursor: sending ? 'wait' : 'pointer',
              opacity: sending ? 0.7 : 1,
              boxShadow: `0 0 20px ${C.gold}30`,
            }}
          >
            <CreditCard size={14} />
            {sending ? 'Creating link...' : 'Send £75 Deposit Link (Stripe)'}
          </button>
          <div style={{ fontSize: 10, color: C.textDim, textAlign: 'center', marginTop: 6 }}>
            Opens Stripe checkout — on payment, lead auto-converts and onboarding message queued
          </div>
        </div>
      )}
    </div>
  )
}

function ConversationDrawer({ lead, onClose }) {
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!lead) return
    leadsApi.get(lead.id).then(setDetail).catch(() => {})
  }, [lead?.id])

  const msgs = detail?.messages || []

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
      background: 'rgba(2, 2, 14, 0.97)',
      backdropFilter: 'blur(20px)',
      borderLeft: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      zIndex: 1000,
      boxShadow: '-20px 0 60px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px', borderBottom: `1px solid ${C.borderDim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: `rgba(0,212,255,0.03)`,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{lead?.business_name}</div>
          <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{lead?.city} · {lead?.phone || 'no phone'}</div>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.borderDim}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: C.textMid }}>
          <X size={14} />
        </button>
      </div>

      {/* Payment status — always show for replied/interested/converted */}
      {['replied', 'interested', 'converted'].includes(lead?.status) && (
        <PaymentStatusBlock lead={lead} />
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!detail ? (
          <div style={{ textAlign: 'center', color: C.textDim, paddingTop: 40, fontFamily: C.mono, letterSpacing: '0.1em', fontSize: 10 }}>LOADING THREAD...</div>
        ) : msgs.length === 0 ? (
          <div style={{ textAlign: 'center', color: C.textDim, paddingTop: 40, fontSize: 12 }}>No messages yet.</div>
        ) : msgs.map((m, i) => {
          const isOut = m.direction === 'outbound'
          const channelColor = m.channel === 'whatsapp' ? '#25D366' : m.channel === 'email' ? '#60a5fa' : '#a78bfa'
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start' }}>
              <div style={{ ...lbl(), color: channelColor + '90', marginBottom: 3, fontSize: 7.5 }}>
                {m.channel?.toUpperCase()} · {isOut ? 'OUTBOUND' : 'INBOUND'} · {relTime(m.created_at)}
              </div>
              <div style={{
                maxWidth: '90%', padding: '9px 13px', borderRadius: isOut ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                background: isOut ? `rgba(0,212,255,0.1)` : 'rgba(255,255,255,0.05)',
                border: isOut ? `1px solid ${C.border}` : '1px solid rgba(255,255,255,0.07)',
                fontSize: 12, lineHeight: 1.55, color: isOut ? C.text : C.textMid,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.body || m.subject || '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LeadRow({ lead, onAction, onSelect }) {
  const [hovered, setHovered] = useState(false)
  const ws = WEBSITE_META[lead.website_status] || WEBSITE_META.unknown

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect && onSelect(lead)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 14px',
        borderRadius: 10,
        border: `1px solid ${hovered ? C.border : 'transparent'}`,
        background: hovered ? 'rgba(0,212,255,0.03)' : 'transparent',
        transition: 'all 0.15s ease',
        cursor: 'pointer',
      }}
    >
      <QualityScore score={lead.quality_score} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.business_name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{lead.city}</span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <span style={{ color: ws.color }}>{ws.label}</span>
          {lead.phone && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
              <span style={{ color: 'rgba(255,255,255,0.28)', fontFamily: '"JetBrains Mono", monospace', fontSize: 10.5 }}>{lead.phone}</span>
            </>
          )}
        </div>
      </div>

      {lead.google_rating && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0, display: 'none' }} className="sm-show">
          ★ {lead.google_rating} ({lead.google_reviews})
        </div>
      )}

      <StatusBadge status={lead.status} />

      <div style={{
        display: 'flex', gap: 6, flexShrink: 0,
        opacity: hovered ? 1 : 0, transition: 'opacity 0.15s ease',
      }}>
        <button
          onClick={e => { e.stopPropagation(); onAction('pipeline', lead) }}
          title="Run full pipeline"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid rgba(212,168,67,0.3)`, background: 'rgba(212,168,67,0.1)', color: C.gold, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Play size={11} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onAction('preview', lead) }}
          title="Generate preview"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.borderDim}`, background: 'rgba(0,212,255,0.04)', color: C.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Globe size={11} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onAction('outreach', lead) }}
          title="Generate outreach"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.borderDim}`, background: 'rgba(0,212,255,0.04)', color: C.textMid, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Send size={11} />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onAction('dnc', lead) }}
          title="Do not contact"
          style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.red}30`, background: 'transparent', color: `${C.red}70`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
        >
          <XCircle size={11} />
        </button>
      </div>
    </div>
  )
}

export default function Leads() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', city: '', search: '' })
  const [toast, setToast] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
    if (filters.status) params.status = filters.status
    if (filters.city)   params.city   = filters.city
    if (filters.search) params.search = filters.search
    leadsApi.list(params)
      .then(d => { setData(d.leads || []); setTotal(d.total || 0) })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [filters, page])

  useEffect(() => { load() }, [load])

  const updateFilter = (key, value) => { setPage(1); setFilters(f => ({ ...f, [key]: value })) }

  const handleAction = async (action, lead) => {
    try {
      if (action === 'pipeline') { await agents.runPipeline(lead.id); showToast(`Pipeline started for ${lead.business_name}`) }
      else if (action === 'preview') { await previewsApi.generate(lead.id); showToast(`Preview generating for ${lead.business_name}`) }
      else if (action === 'outreach') { await outreachApi.generate(lead.id, 'email', 1); showToast(`Outreach queued for ${lead.business_name}`) }
      else if (action === 'dnc') {
        if (confirm(`Mark ${lead.business_name} as Do Not Contact?`)) {
          await leadsApi.doNotContact(lead.id); showToast(`${lead.business_name} marked DNC`)
        }
      }
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hotLeads = data.filter(l => ['replied', 'interested'].includes(l.status))

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>

      {selectedLead && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} onClick={() => setSelectedLead(null)} />
          <ConversationDrawer lead={selectedLead} onClose={() => setSelectedLead(null)} />
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : `linear-gradient(135deg, ${C.gold}, #F0C96A)`,
          color: toast.type === 'error' ? 'white' : 'black',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={lbl()}>LEAD INTELLIGENCE</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>Leads</h1>
          <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
            {total > 0 ? `${total.toLocaleString()} leads · page ${page} of ${totalPages} · click any lead to view thread` : 'Loading...'}
          </p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} color={C.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            style={{
              background: 'rgba(0,8,28,0.6)',
              border: `1px solid ${C.borderDim}`,
              color: C.text,
              borderRadius: 9,
              padding: '8px 12px 8px 30px',
              fontSize: 13,
              outline: 'none',
              width: 200,
              fontFamily: 'Inter, sans-serif',
              transition: 'border-color 0.15s',
            }}
            placeholder="Search name..."
            value={filters.search}
            onChange={e => updateFilter('search', e.target.value)}
          />
        </div>
        <select
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: 'rgba(255,255,255,0.65)',
            borderRadius: 9,
            padding: '8px 12px',
            fontSize: 13,
            outline: 'none',
            fontFamily: 'Inter, sans-serif',
            cursor: 'pointer',
          }}
          value={filters.status}
          onChange={e => updateFilter('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <input
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: 'white',
            borderRadius: 9,
            padding: '8px 12px',
            fontSize: 13,
            outline: 'none',
            width: 140,
            fontFamily: 'Inter, sans-serif',
          }}
          placeholder="City..."
          value={filters.city}
          onChange={e => updateFilter('city', e.target.value)}
        />
      </div>

      {/* Hot leads */}
      {hotLeads.length > 0 && !filters.status && (
        <div style={{
          background: 'rgba(212,168,67,0.04)',
          border: `1px solid rgba(212,168,67,0.22)`,
          borderRadius: 12,
          padding: '14px 16px',
          marginBottom: 14,
          boxShadow: `0 0 24px rgba(212,168,67,0.06)`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}`, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
            <span style={{ ...lbl(), color: `${C.gold}90`, fontSize: 9 }}>NEEDS YOUR ATTENTION — {hotLeads.length} LEADS</span>
            <div style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>click any lead to view thread + send payment link</div>
          </div>
          {hotLeads.map(lead => <LeadRow key={lead.id} lead={lead} onAction={handleAction} onSelect={setSelectedLead} />)}
        </div>
      )}

      {/* Main list */}
      <div style={{ ...panelStyle(), overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borderDim}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, opacity: 0.5 }} />
            <span style={lbl()}>ALL LEADS</span>
          </div>
          <span style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>{loading ? '...' : `${data.length} shown`}</span>
        </div>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.textMid, fontSize: 13, fontFamily: C.mono, letterSpacing: '0.1em' }}>LOADING LEADS...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.textMid, fontSize: 13 }}>
            No leads found. Run the Lead Finder from the Dashboard.
          </div>
        ) : (
          <div style={{ padding: '6px 4px' }}>
            {data
              .filter(l => !['replied', 'interested'].includes(l.status) || !!filters.status)
              .map(lead => <LeadRow key={lead.id} lead={lead} onAction={handleAction} onSelect={setSelectedLead} />)
            }
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-ghost"
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '0 4px' }}>
              {page} / {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn-ghost"
              style={{ padding: '6px 10px', fontSize: 12 }}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
