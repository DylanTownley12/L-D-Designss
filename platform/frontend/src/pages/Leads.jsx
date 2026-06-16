import { useState, useEffect, useCallback } from 'react'
import { leads as leadsApi, agents, previews as previewsApi, outreach as outreachApi, payments } from '../api/client'
import { Search, RefreshCcw, Play, Globe, Send, XCircle, ChevronLeft, ChevronRight, CreditCard, MessageSquare, X, Flame, AtSign, ExternalLink, Phone } from 'lucide-react'

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
const panel = (x = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, ...x })

const PAGE_SIZE = 50

const STATUS_META = {
  new:             { label: 'New',            bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', dot: '#6b7280' },
  analyzing:       { label: 'Analysing',      bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', dot: '#3b82f6' },
  preview_ready:   { label: 'Preview Ready',  bg: 'rgba(168,85,247,0.12)',  color: '#c084fc', dot: '#a855f7' },
  outreach_queued: { label: 'Queued',         bg: 'rgba(245,158,11,0.12)',  color: '#fbbf24', dot: '#f59e0b' },
  outreach_sent:   { label: 'Sent',           bg: 'rgba(6,182,212,0.12)',   color: '#22d3ee', dot: '#06b6d4' },
  replied:         { label: 'Replied 🔥',     bg: 'rgba(245,158,11,0.15)', color: '#fcd34d', dot: '#f59e0b', bold: true },
  interested:      { label: 'Interested ⚡',  bg: 'rgba(0,255,136,0.12)',  color: '#6ee7b7', dot: '#10b981', bold: true },
  converted:       { label: 'Client ✓',       bg: 'rgba(16,185,129,0.2)',  color: '#6ee7b7', dot: '#10b981', bold: true },
  not_interested:  { label: 'Not Interested', bg: 'rgba(239,68,68,0.1)',   color: '#fca5a5', dot: '#ef4444' },
  do_not_contact:  { label: 'DNC',            bg: 'rgba(127,29,29,0.2)',   color: '#fca5a5', dot: '#7f1d1d' },
}

const VIEWS = [
  { key: 'hot',      label: '🔥 Hot Now',         statusFilter: 'replied,interested', desc: 'Replied + interested — close these first' },
  { key: 'replied',  label: 'Replied',             statusFilter: 'replied',            desc: 'Waiting for follow-up' },
  { key: 'interested', label: '⚡ Interested',     statusFilter: 'interested',         desc: 'Ready for payment link' },
  { key: 'sent',     label: 'Sent',                statusFilter: 'outreach_sent',      desc: 'Messaged, no reply yet' },
  { key: 'nw_phone', label: 'No Site + Phone',     statusFilter: '',                   desc: 'Best WhatsApp targets' },
  { key: 'nw_ig',    label: 'No Site + Instagram', statusFilter: '',                   desc: 'Best Instagram targets' },
  { key: 'all',      label: 'All Leads',           statusFilter: '',                   desc: '' },
]

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, bg: 'rgba(107,114,128,0.15)', color: '#9ca3af', dot: '#6b7280' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, background: m.bg, fontSize: 10.5, fontWeight: m.bold ? 700 : 500, color: m.color, whiteSpace: 'nowrap' }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  )
}

function ScoreBadge({ score }) {
  if (!score) return <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 10, color: C.textDim }}>?</span></div>
  const hue = score
  return (
    <div style={{ width: 32, height: 32, borderRadius: 8, background: `hsl(${hue},55%,12%)`, border: `1px solid hsl(${hue},55%,24%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: `hsl(${hue},75%,65%)` }}>{score}</span>
    </div>
  )
}

function relTime(iso) {
  if (!iso) return '—'
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function ActionBtn({ onClick, color, title, children }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick() }}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28, height: 28, borderRadius: 7, border: `1px solid ${color}40`,
        background: hover ? `${color}20` : `${color}0a`,
        color: hover ? color : `${color}90`,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s', flexShrink: 0,
      }}
    >{children}</button>
  )
}

function PaymentBlock({ lead }) {
  const [payStatus, setPayStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  useEffect(() => {
    if (!lead?.id) return
    payments.getStatus(lead.id).then(setPayStatus).catch(() => setPayStatus(null)).finally(() => setLoading(false))
  }, [lead?.id])
  const sendLink = async () => {
    setSending(true)
    try { const { checkout_url } = await payments.createCheckout(lead.id); window.open(checkout_url, '_blank'); payments.getStatus(lead.id).then(setPayStatus).catch(() => {}) }
    catch (e) { alert(e.message) } finally { setSending(false) }
  }
  const isPaid = payStatus?.payment_status === 'paid' || lead?.status === 'converted'
  const isAwaiting = payStatus?.session_id && !isPaid
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borderDim}`, background: isPaid ? 'rgba(0,255,136,0.03)' : 'rgba(212,168,67,0.03)' }}>
      <div style={{ ...lbl({ color: isPaid ? C.green : C.gold, marginBottom: 7, fontSize: 8 }) }}>PAYMENT</div>
      {loading ? <div style={{ fontSize: 11, color: C.textDim }}>Checking Stripe...</div>
        : isPaid ? <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>£199 + £29/MO PAID ✓</div>
        : isAwaiting ? (
          <div>
            <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 8 }}>Link sent — awaiting payment</div>
            <button onClick={sendLink} disabled={sending} style={{ width: '100%', padding: '8px', borderRadius: 8, border: `1px solid rgba(212,168,67,0.3)`, background: 'rgba(212,168,67,0.1)', color: C.gold, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              {sending ? 'Creating...' : 'Resend Link'}
            </button>
          </div>
        ) : (
          <button onClick={sendLink} disabled={sending} style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, color: '#000', fontWeight: 700, fontSize: 13, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1 }}>
            <CreditCard size={13} style={{ marginRight: 7, verticalAlign: 'middle' }} />
            {sending ? 'Creating...' : 'Send £199 + £29/mo Link'}
          </button>
        )
      }
    </div>
  )
}

function LeadDrawer({ lead, onClose, onUpdated }) {
  const [detail, setDetail] = useState(null)
  const [marking, setMarking] = useState(false)
  useEffect(() => { if (lead) leadsApi.get(lead.id).then(setDetail).catch(() => {}) }, [lead?.id])
  const markReplied = async () => {
    const msg = prompt('What did they say? (optional)')
    if (msg === null) return
    setMarking(true)
    try { await leadsApi.logReply(lead.id, msg || 'Manually marked replied'); onUpdated?.(); onClose() }
    catch (e) { alert(e.message) } finally { setMarking(false) }
  }
  const phone = lead?.phone ? (lead.phone.replace(/[\s\-\+]/g, '').replace(/^0/, '44')) : null
  const waLink = phone ? `https://wa.me/${phone}` : null
  const msgs = detail?.messages || []
  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: 'rgba(2,2,14,0.97)', backdropFilter: 'blur(20px)', borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', zIndex: 1000, boxShadow: '-20px 0 60px rgba(0,0,0,0.5)' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.borderDim}`, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{lead?.business_name}</div>
          <div style={{ fontSize: 11, color: C.textMid, marginTop: 2 }}>{lead?.city} · {lead?.phone || 'no phone'}</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {waLink && <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.3)', color: '#25D366', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}><Phone size={11} /> WhatsApp</a>}
          {lead?.instagram_url && <a href={lead.instagram_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.3)', color: '#a855f7', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}><AtSign size={11} /> IG</a>}
          {!['replied','interested','converted'].includes(lead?.status) && (
            <button onClick={markReplied} disabled={marking} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              <MessageSquare size={11} /> Replied
            </button>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${C.borderDim}`, borderRadius: 8, padding: '5px 8px', cursor: 'pointer', color: C.textMid }}><X size={13} /></button>
        </div>
      </div>
      {!['new','analyzing','do_not_contact'].includes(lead?.status) && <PaymentBlock lead={lead} />}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!detail ? <div style={{ textAlign: 'center', color: C.textDim, paddingTop: 40, fontFamily: C.mono, fontSize: 10 }}>LOADING...</div>
          : msgs.length === 0 ? <div style={{ textAlign: 'center', color: C.textDim, paddingTop: 40, fontSize: 12 }}>No messages yet.</div>
          : msgs.map((m, i) => {
            const isOut = m.direction === 'outbound'
            const chColor = m.channel === 'whatsapp' ? '#25D366' : m.channel === 'email' ? '#60a5fa' : '#a78bfa'
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isOut ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...lbl({ color: chColor + '80', marginBottom: 3, fontSize: 7.5 }) }}>{m.channel?.toUpperCase()} · {isOut ? 'OUT' : 'IN'} · {relTime(m.created_at)}</div>
                <div style={{ maxWidth: '90%', padding: '9px 12px', borderRadius: isOut ? '12px 12px 3px 12px' : '3px 12px 12px 12px', background: isOut ? 'rgba(0,212,255,0.08)' : 'rgba(255,255,255,0.04)', border: isOut ? `1px solid ${C.border}` : '1px solid rgba(255,255,255,0.06)', fontSize: 12, lineHeight: 1.55, color: isOut ? C.text : C.textMid, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {m.body || m.subject || '—'}
                </div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

function LeadRow({ lead, onAction, onSelect, highlight }) {
  const [hov, setHov] = useState(false)
  const phone = lead.phone ? lead.phone.replace(/[\s\-\+]/g, '').replace(/^0/, '44') : null
  const waLink = phone ? `https://wa.me/${phone}` : null
  const nextAction = (() => {
    if (lead.status === 'interested') return { text: 'Send payment link', color: C.gold }
    if (lead.status === 'replied') return { text: 'Follow up now', color: '#fcd34d' }
    if (lead.status === 'outreach_sent') return { text: 'Waiting for reply', color: C.textDim }
    if (lead.status === 'preview_ready') return { text: 'Ready to outreach', color: C.cyan }
    return null
  })()

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => onSelect(lead)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
        border: `1px solid ${hov || highlight ? C.border : 'transparent'}`,
        background: highlight ? 'rgba(212,168,67,0.04)' : hov ? 'rgba(0,212,255,0.02)' : 'transparent',
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <ScoreBadge score={lead.quality_score} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.business_name}
          {lead.website_status === 'none' && <span style={{ marginLeft: 6, fontSize: 9.5, padding: '1px 6px', borderRadius: 99, background: 'rgba(0,255,136,0.1)', color: C.green, fontWeight: 600 }}>no website</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.textDim, flexWrap: 'wrap' }}>
          <span>{lead.city}</span>
          {nextAction && <>
            <span style={{ color: 'rgba(255,255,255,0.1)' }}>·</span>
            <span style={{ color: nextAction.color, fontSize: 10.5, fontWeight: 500 }}>{nextAction.text}</span>
          </>}
        </div>
      </div>

      <StatusBadge status={lead.status} />

      <div style={{ display: 'flex', gap: 5, flexShrink: 0, opacity: hov ? 1 : 0.3, transition: 'opacity 0.12s' }}>
        {waLink && (
          <ActionBtn color="#25D366" title="Open WhatsApp" onClick={() => window.open(waLink, '_blank')}>
            <Phone size={11} />
          </ActionBtn>
        )}
        {lead.instagram_url && (
          <ActionBtn color="#a855f7" title="Open Instagram" onClick={() => window.open(lead.instagram_url, '_blank')}>
            <AtSign size={11} />
          </ActionBtn>
        )}
        <ActionBtn color={C.cyan} title="Run pipeline" onClick={() => onAction('pipeline', lead)}>
          <Play size={11} />
        </ActionBtn>
        <ActionBtn color={C.textDim} title="Generate preview" onClick={() => onAction('preview', lead)}>
          <Globe size={11} />
        </ActionBtn>
        <ActionBtn color={C.red} title="Do not contact" onClick={() => onAction('dnc', lead)}>
          <XCircle size={11} />
        </ActionBtn>
      </div>
    </div>
  )
}

export default function Leads() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('hot')
  const [search, setSearch] = useState('')
  const [city, setCity] = useState('')
  const [toast, setToast] = useState(null)
  const [selected, setSelected] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const currentView = VIEWS.find(v => v.key === view) || VIEWS[0]

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }
    if (currentView.statusFilter) params.status = currentView.statusFilter
    if (city) params.city = city
    if (search) params.search = search
    leadsApi.list(params)
      .then(d => {
        let leads = d.leads || []
        if (view === 'nw_phone') leads = leads.filter(l => l.website_status === 'none' && l.phone)
        if (view === 'nw_ig') leads = leads.filter(l => l.website_status === 'none' && l.instagram_url)
        setData(leads)
        setTotal(d.total || 0)
      })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [view, search, city, page])

  useEffect(() => { load() }, [load])
  const setView2 = v => { setView(v); setPage(1) }

  const handleAction = async (action, lead) => {
    try {
      if (action === 'pipeline') { await agents.runPipeline(lead.id); showToast(`Pipeline started for ${lead.business_name}`) }
      else if (action === 'preview') { await previewsApi.generate(lead.id); showToast(`Preview generating`) }
      else if (action === 'outreach') { await outreachApi.generate(lead.id, 'email', 1); showToast(`Outreach queued`) }
      else if (action === 'dnc') { if (confirm(`Mark ${lead.business_name} as Do Not Contact?`)) { await leadsApi.doNotContact(lead.id); showToast('Marked DNC') } }
      load()
    } catch (e) { showToast(e.message, 'error') }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hotViews = ['hot', 'replied', 'interested']

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {selected && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }} onClick={() => setSelected(null)} />
          <LeadDrawer lead={selected} onClose={() => setSelected(null)} onUpdated={load} />
        </>
      )}
      {toast && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, padding: '10px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: toast.type === 'error' ? 'rgba(255,51,85,0.9)' : `linear-gradient(135deg, ${C.gold}, #F0C96A)`, color: toast.type === 'error' ? '#fff' : '#000', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={lbl()}>HOT LEAD CLOSE LIST</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Leads</h1>
          {currentView.desc && <p style={{ fontSize: 12, color: C.textMid, marginTop: 3 }}>{currentView.desc}</p>}
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16 }}>
        {VIEWS.map(v => {
          const isActive = view === v.key
          const isHot = hotViews.includes(v.key)
          return (
            <button key={v.key} onClick={() => setView2(v.key)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: isActive ? 700 : 500,
              border: `1px solid ${isActive ? (isHot ? 'rgba(212,168,67,0.5)' : C.border) : C.borderDim}`,
              background: isActive ? (isHot ? 'rgba(212,168,67,0.12)' : 'rgba(0,212,255,0.08)') : 'transparent',
              color: isActive ? (isHot ? C.gold : C.cyan) : C.textMid, cursor: 'pointer',
            }}>{v.label}</button>
          )
        })}
      </div>

      {/* Search row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} color={C.textDim} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input style={{ background: 'rgba(0,8,28,0.6)', border: `1px solid ${C.borderDim}`, color: C.text, borderRadius: 8, padding: '7px 12px 7px 28px', fontSize: 12.5, outline: 'none', width: 190, fontFamily: 'Inter, sans-serif' }}
            placeholder="Search name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <input style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.text, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, outline: 'none', width: 130, fontFamily: 'Inter, sans-serif' }}
          placeholder="City..." value={city} onChange={e => { setCity(e.target.value); setPage(1) }} />
        <span style={{ alignSelf: 'center', fontSize: 11, color: C.textDim, fontFamily: C.mono }}>{loading ? '...' : `${total.toLocaleString()} leads`}</span>
      </div>

      {/* Lead list */}
      <div style={{ ...panel({ overflow: 'hidden' }) }}>
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.borderDim}`, display: 'flex', alignItems: 'center', gap: 6 }}>
          {hotViews.includes(view) && <Flame size={11} color={C.gold} />}
          <span style={lbl()}>{currentView.label}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{data.length} shown · click row to open thread</span>
        </div>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: C.textDim, fontSize: 12, fontFamily: C.mono }}>LOADING...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: C.textMid, fontSize: 13 }}>
            {view === 'hot' ? 'No hot leads yet — keep sending outreach.' : 'No leads match this filter.'}
          </div>
        ) : (
          <div style={{ padding: '6px 4px' }}>
            {data.map(lead => (
              <LeadRow
                key={lead.id}
                lead={lead}
                onAction={handleAction}
                onSelect={setSelected}
                highlight={['replied','interested'].includes(lead.status)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
          <span style={{ fontSize: 12, color: C.textDim }}>{(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE,total)} of {total}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={page<=1} onClick={() => setPage(p=>p-1)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.borderDim}`, background: 'transparent', color: C.textMid, cursor: page<=1?'not-allowed':'pointer', fontSize: 12 }}>
              <ChevronLeft size={12} /> Prev
            </button>
            <span style={{ fontSize: 12, color: C.textDim, alignSelf: 'center' }}>{page}/{totalPages}</span>
            <button disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.borderDim}`, background: 'transparent', color: C.textMid, cursor: page>=totalPages?'not-allowed':'pointer', fontSize: 12 }}>
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
