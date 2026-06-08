import { useState, useEffect } from 'react'
import axios from 'axios'
import { Phone, ExternalLink, MessageCircle, CheckCircle, XCircle, Clock, CreditCard, ChevronDown, ChevronUp, RefreshCcw } from 'lucide-react'

const API = import.meta.env.VITE_API_URL || '/api'
const ax = axios.create({ baseURL: API })

const C = {
  bg:      '#02020e',
  panel:   'rgba(0, 8, 28, 0.8)',
  border:  'rgba(0, 212, 255, 0.1)',
  cyan:    '#00D4FF',
  green:   '#00FF88',
  gold:    '#D4A843',
  red:     '#FF3355',
  purple:  '#a855f7',
  orange:  '#f97316',
  text:    'rgba(255,255,255,0.88)',
  textMid: 'rgba(255,255,255,0.42)',
  textDim: 'rgba(255,255,255,0.18)',
  mono:    '"JetBrains Mono", monospace',
}

const STATUS_CFG = {
  preview_ready:      { label: 'Preview Ready',      color: C.purple, dot: '#a855f7' },
  outreach_sent:      { label: 'WA Sent',            color: C.cyan,   dot: '#06b6d4' },
  called:             { label: 'Called',             color: C.gold,   dot: '#D4A843' },
  follow_up_required: { label: 'Follow-Up',          color: C.orange, dot: '#f97316' },
  interested:         { label: 'Interested',         color: C.green,  dot: '#00FF88' },
  payment_link_sent:  { label: 'Payment Sent',       color: '#22c55e', dot: '#22c55e' },
  replied:            { label: 'Replied',            color: C.cyan,   dot: '#06b6d4' },
  converted:          { label: 'Paid / Customer',   color: C.green,  dot: '#00FF88' },
  not_interested:     { label: 'Not Interested',    color: C.red,    dot: '#FF3355' },
}

const lbl = x => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...x })
const card = x => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, ...x })

const PIPELINE_STATUSES = ['interested', 'follow_up_required', 'called', 'replied', 'outreach_sent', 'preview_ready']

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || { label: status, color: C.textMid, dot: '#666' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: `${cfg.dot}18`, border: `1px solid ${cfg.dot}40`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: cfg.color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {cfg.label}
    </span>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ ...card(), padding: '12px 16px', textAlign: 'center', minWidth: 90 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || C.cyan, fontFamily: C.mono }}>{value}</div>
      <div style={lbl({ marginTop: 4 })}>{label}</div>
    </div>
  )
}

function LeadCard({ lead, onUpdate }) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const logCall = async (status) => {
    setSaving(true)
    try {
      await ax.post(`/calls/${lead.id}/log`, { status, notes: notes || undefined })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onUpdate(lead.id, status, notes)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const sendPaymentLink = async () => {
    try {
      const r = await ax.post(`/payments/create-checkout/${lead.id}`)
      const url = r.data?.checkout_url
      if (url) {
        await navigator.clipboard.writeText(url).catch(() => {})
        window.open(url, '_blank')
      }
      await logCall('payment_link_sent')
    } catch (e) {
      alert('Payment link failed — check Stripe config')
    }
  }

  return (
    <div style={{ ...card(), marginBottom: 8, overflow: 'hidden' }}>
      {/* Header row */}
      <div
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{lead.business_name}</span>
            <StatusBadge status={lead.status} />
            {lead.google_rating && (
              <span style={{ fontSize: 11, color: C.gold }}>★ {lead.google_rating}</span>
            )}
            {lead.has_real_photos && (
              <span title="Preview uses this barber's real Google photos" style={{
                fontSize: 10, fontWeight: 700, color: C.green,
                background: `${C.green}14`, border: `1px solid ${C.green}40`,
                borderRadius: 5, padding: '1px 6px', letterSpacing: '0.04em',
              }}>📷 REAL PHOTOS</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: C.textMid, marginTop: 2 }}>
            {lead.city} · {lead.phone}
            {lead.notes && <span style={{ color: C.textDim }}> · has notes</span>}
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
          {lead.phone && (
            <button
              onClick={() => navigator.clipboard.writeText(lead.phone).catch(() => {})}
              title="Copy number"
              style={{
                background: `${C.green}18`, border: `1px solid ${C.green}40`, borderRadius: 8,
                padding: '6px 12px', color: C.green, fontSize: 12, fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              }}
            >
              <Phone size={12} /> {lead.phone}
            </button>
          )}
          {lead.whatsapp_url && (
            <a href={lead.whatsapp_url} target="_blank" rel="noreferrer" style={{
              background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)', borderRadius: 8,
              padding: '6px 12px', color: '#25D366', fontSize: 12, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <MessageCircle size={12} /> WA
            </a>
          )}
          {lead.preview_url ? (
            <a href={lead.preview_url} target="_blank" rel="noreferrer" style={{
              background: `${C.purple}18`, border: `1px solid ${C.purple}40`, borderRadius: 8,
              padding: '6px 12px', color: C.purple, fontSize: 12, fontWeight: 600, textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <ExternalLink size={12} /> Preview
            </a>
          ) : (
            <span style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '6px 12px', color: C.textDim, fontSize: 12, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              No Preview
            </span>
          )}
        </div>
        <div style={{ color: C.textDim, marginLeft: 8 }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${C.border}` }}>
          {/* Next action */}
          <div style={{ padding: '10px 0', marginBottom: 12 }}>
            <div style={lbl({ marginBottom: 4 })}>Next Action</div>
            <div style={{ fontSize: 13, color: C.gold }}>{lead.next_action}</div>
          </div>

          {/* Existing notes */}
          {lead.notes && (
            <div style={{ marginBottom: 12 }}>
              <div style={lbl({ marginBottom: 4 })}>Previous Notes</div>
              <div style={{
                fontSize: 12, color: C.textMid, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 8,
              }}>{lead.notes}</div>
            </div>
          )}

          {/* Notes input */}
          <textarea
            placeholder="Add call notes..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{
              width: '100%', background: 'rgba(0,212,255,0.04)', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '8px 10px', color: C.text, fontSize: 13,
              resize: 'vertical', minHeight: 60, marginBottom: 12, boxSizing: 'border-box',
              fontFamily: 'inherit',
            }}
          />

          {/* Status update buttons */}
          <div style={lbl({ marginBottom: 8 })}>Update Status</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[
              { status: 'called',             label: 'Called',           color: C.gold },
              { status: 'interested',         label: 'Interested',       color: C.green },
              { status: 'follow_up_required', label: 'Follow-Up Needed', color: C.orange },
              { status: 'not_interested',     label: 'Not Interested',   color: C.red },
            ].map(({ status, label, color }) => (
              <button
                key={status}
                disabled={saving}
                onClick={() => logCall(status)}
                style={{
                  background: `${color}18`, border: `1px solid ${color}40`,
                  borderRadius: 8, padding: '6px 14px', color, fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', opacity: saving ? 0.5 : 1,
                }}
              >{saved ? '✓ Saved' : label}</button>
            ))}

            {['interested', 'follow_up_required'].includes(lead.status) && (
              <button
                disabled={saving}
                onClick={sendPaymentLink}
                style={{
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)',
                  borderRadius: 8, padding: '6px 14px', color: '#22c55e', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <CreditCard size={12} /> Send £175 Payment Link
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function Calls() {
  const [leads, setLeads] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [board, statsResp] = await Promise.all([
        ax.get('/calls/board?limit=500'),
        ax.get('/calls/stats'),
      ])
      setLeads(board.data.leads || [])
      setStats(statsResp.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleUpdate = (leadId, newStatus, _notes) => {
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
  }

  const filtered = leads.filter(l => {
    if (filter !== 'all' && l.status !== filter) return false
    if (search && !l.business_name.toLowerCase().includes(search.toLowerCase()) && !l.city.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: 24, color: C.text }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: C.text }}>Call Board</h1>
            <div style={{ fontSize: 13, color: C.textMid, marginTop: 4 }}>Tomorrow's 100 calls — track every conversation</div>
          </div>
          <button onClick={load} disabled={loading} style={{
            background: `${C.cyan}12`, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '8px 14px', color: C.cyan, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <RefreshCcw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatCard label="Interested" value={stats.interested} color={C.green} />
            <StatCard label="Follow-Up" value={stats.follow_up_required} color={C.orange} />
            <StatCard label="Called" value={stats.called} color={C.gold} />
            <StatCard label="WA Sent" value={stats.outreach_sent} color={C.cyan} />
            <StatCard label="Preview Ready" value={stats.preview_ready} color={C.purple} />
            <StatCard label="Paid" value={stats.converted} color={C.green} />
            <StatCard label="Total Callable" value={stats.total_callable} color={C.text} />
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            placeholder="Search name or city..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              background: 'rgba(0,212,255,0.04)', border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '7px 12px', color: C.text, fontSize: 13,
              width: 220,
            }}
          />
          {['all', 'interested', 'follow_up_required', 'called', 'outreach_sent', 'preview_ready', 'not_interested'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: filter === s ? `${C.cyan}20` : 'rgba(255,255,255,0.03)',
              border: filter === s ? `1px solid ${C.cyan}60` : `1px solid ${C.border}`,
              borderRadius: 8, padding: '6px 12px', color: filter === s ? C.cyan : C.textMid,
              fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
              cursor: 'pointer',
            }}>
              {s === 'all' ? 'All' : STATUS_CFG[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Lead list */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.textMid, padding: 48 }}>Loading leads...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.textMid, padding: 48 }}>No leads match this filter.</div>
      ) : (
        <div>
          <div style={lbl({ marginBottom: 10 })}>{filtered.length} leads</div>
          {filtered.map(lead => (
            <LeadCard key={lead.id} lead={lead} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}
