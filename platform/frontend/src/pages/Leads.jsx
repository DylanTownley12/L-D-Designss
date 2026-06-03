import { useState, useEffect, useCallback } from 'react'
import { leads as leadsApi, agents, previews as previewsApi, outreach as outreachApi } from '../api/client'
import { Search, RefreshCcw, Play, Globe, Send, XCircle, ChevronLeft, ChevronRight, Flame } from 'lucide-react'

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

function LeadRow({ lead, onAction }) {
  const [hovered, setHovered] = useState(false)
  const ws = WEBSITE_META[lead.website_status] || WEBSITE_META.unknown

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 14px',
        borderRadius: 10,
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.09)' : 'transparent'}`,
        background: hovered ? 'rgba(255,255,255,0.025)' : 'transparent',
        transition: 'all 0.15s ease',
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
          onClick={() => onAction('pipeline', lead)}
          title="Run full pipeline"
          style={{
            width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(212,168,67,0.3)',
            background: 'rgba(212,168,67,0.1)', color: '#D4A843', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Play size={11} />
        </button>
        <button
          onClick={() => onAction('preview', lead)}
          title="Generate preview"
          className="btn-ghost"
          style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Globe size={11} />
        </button>
        <button
          onClick={() => onAction('outreach', lead)}
          title="Generate outreach"
          className="btn-ghost"
          style={{ width: 28, height: 28, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Send size={11} />
        </button>
        <button
          onClick={() => onAction('dnc', lead)}
          title="Do not contact"
          style={{
            width: 28, height: 28, borderRadius: 7, border: '1px solid rgba(239,68,68,0.2)',
            background: 'transparent', color: 'rgba(239,68,68,0.5)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          }}
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

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          padding: '10px 16px', borderRadius: 12, fontSize: 13, fontWeight: 500,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          background: toast.type === 'error' ? 'rgba(239,68,68,0.9)' : 'linear-gradient(135deg, #D4A843, #F0C96A)',
          color: toast.type === 'error' ? 'white' : 'black',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)' }}>Leads</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
            {total > 0 ? `${total.toLocaleString()} leads · page ${page} of ${totalPages}` : 'Loading...'}
          </p>
        </div>
        <button onClick={load} className="btn-ghost" style={{ fontSize: 12 }}>
          <RefreshCcw size={12} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} color="rgba(255,255,255,0.25)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: 'white',
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
          background: 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, #0c0c12 100%)',
          border: '1px solid rgba(245,158,11,0.22)',
          borderRadius: 14,
          padding: '14px 16px',
          marginBottom: 14,
          boxShadow: '0 0 24px rgba(245,158,11,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
            <Flame size={13} color="#f59e0b" />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(245,158,11,0.7)' }}>
              Needs Your Attention
            </span>
          </div>
          {hotLeads.map(lead => <LeadRow key={lead.id} lead={lead} onAction={handleAction} />)}
        </div>
      )}

      {/* Main list */}
      <div style={{ background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.28)' }}>All Leads</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>{loading ? '...' : `${data.length} shown`}</span>
        </div>
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>Loading leads...</div>
        ) : data.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
            No leads. Run the Lead Finder from the Dashboard.
          </div>
        ) : (
          <div style={{ padding: '6px 4px' }}>
            {data
              .filter(l => !['replied', 'interested'].includes(l.status) || !!filters.status)
              .map(lead => <LeadRow key={lead.id} lead={lead} onAction={handleAction} />)
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
