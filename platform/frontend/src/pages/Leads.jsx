import { useState, useEffect, useCallback } from 'react'
import { leads as leadsApi, agents, previews as previewsApi, outreach as outreachApi } from '../api/client'

const STATUS_LABELS = {
  new: { label: 'New', color: 'bg-gray-500/20 text-gray-400' },
  analyzing: { label: 'Analysing', color: 'bg-blue-500/20 text-blue-400' },
  preview_ready: { label: 'Preview Ready', color: 'bg-purple-500/20 text-purple-400' },
  outreach_queued: { label: 'Queued', color: 'bg-amber-500/20 text-amber-400' },
  outreach_sent: { label: 'Sent', color: 'bg-cyan-500/20 text-cyan-400' },
  replied: { label: 'Replied! 💬', color: 'bg-amber-500/20 text-amber-300 font-semibold' },
  interested: { label: 'Interested 🔥', color: 'bg-purple-500/20 text-purple-300 font-semibold' },
  converted: { label: 'Client ✓', color: 'bg-emerald-500/20 text-emerald-400 font-semibold' },
  not_interested: { label: 'Not Interested', color: 'bg-red-500/20 text-red-400' },
  do_not_contact: { label: 'DNC', color: 'bg-red-900/40 text-red-600' },
}

const WEBSITE_LABELS = {
  none: { label: 'No Website', color: 'text-emerald-400' },
  weak: { label: 'Weak Site', color: 'text-amber-400' },
  decent: { label: 'Decent', color: 'text-blue-400' },
  good: { label: 'Good', color: 'text-gray-400' },
  unknown: { label: 'Unknown', color: 'text-gray-500' },
}

function LeadRow({ lead, onAction }) {
  const status = STATUS_LABELS[lead.status] || { label: lead.status, color: 'bg-gray-500/20 text-gray-400' }
  const ws = WEBSITE_LABELS[lead.website_status] || WEBSITE_LABELS.unknown

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-white/3 rounded-xl border border-transparent hover:border-white/8 transition-all group">
      {/* Quality score */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
           style={{ background: `hsl(${lead.quality_score}, 60%, 25%)`, color: `hsl(${lead.quality_score}, 80%, 65%)` }}>
        {lead.quality_score}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{lead.business_name}</div>
        <div className="text-white/40 text-xs">{lead.city} · {ws.label && <span className={ws.color}>{ws.label}</span>}</div>
        <div className="text-white/30 text-xs mt-0.5">
          {lead.phone && <span>📞 {lead.phone}</span>}
          {lead.phone && lead.email && <span className="mx-1">·</span>}
          {lead.email && <span>✉️ {lead.email}</span>}
        </div>
      </div>

      {/* Rating */}
      {lead.google_rating && (
        <div className="text-xs text-white/50 flex-shrink-0 hidden sm:block">
          ⭐ {lead.google_rating} ({lead.google_reviews})
        </div>
      )}

      {/* Status badge */}
      <span className={`badge flex-shrink-0 hidden md:inline-flex ${status.color}`}>{status.label}</span>

      {/* Actions */}
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={() => onAction('pipeline', lead)}
                className="text-xs btn-gold px-2 py-1" title="Run full pipeline">
          ▶
        </button>
        <button onClick={() => onAction('preview', lead)}
                className="text-xs btn-ghost px-2 py-1" title="Generate preview">
          🌐
        </button>
        <button onClick={() => onAction('outreach', lead)}
                className="text-xs btn-ghost px-2 py-1" title="Generate outreach">
          📤
        </button>
        <button onClick={() => onAction('dnc', lead)}
                className="text-xs text-red-500/50 hover:text-red-400 px-2 py-1" title="Do not contact">
          🚫
        </button>
      </div>
    </div>
  )
}

const PAGE_SIZE = 50

export default function Leads() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({ status: '', city: '', search: '' })
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(() => {
    setLoading(true)
    const params = { limit: PAGE_SIZE, offset: page * PAGE_SIZE }
    if (filters.status) params.status = filters.status
    if (filters.city)   params.city   = filters.city
    if (filters.search) params.search = filters.search
    leadsApi.list(params)
      .then(d => { setData(d.leads || []); setTotal(d.total || 0) })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [filters, page])

  useEffect(() => { load() }, [load])

  const handleAction = async (action, lead) => {
    try {
      if (action === 'pipeline') {
        await agents.runPipeline(lead.id)
        showToast(`Pipeline started for ${lead.business_name}`)
      } else if (action === 'preview') {
        await previewsApi.generate(lead.id)
        showToast(`Preview generating for ${lead.business_name}`)
      } else if (action === 'outreach') {
        const res = await outreachApi.generate(lead.id, 'email', 1)
        showToast(`Outreach queued for ${lead.business_name}`)
      } else if (action === 'dnc') {
        if (confirm(`Mark ${lead.business_name} as Do Not Contact?`)) {
          await leadsApi.doNotContact(lead.id)
          showToast(`${lead.business_name} marked DNC`)
        }
      }
      load()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const statusGroups = ['replied', 'interested', 'preview_ready', 'new', 'outreach_sent', 'converted']

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {total} leads · page {page + 1} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </p>
        </div>
        <button onClick={load} className="btn-ghost text-xs">↻ Refresh</button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          className="bg-dark-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/50 w-48"
          placeholder="Search name..."
          value={filters.search}
          onChange={e => { setPage(0); setFilters(f => ({ ...f, search: e.target.value })) }}
        />
        <select
          className="bg-dark-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 focus:outline-none focus:border-gold/50"
          value={filters.status}
          onChange={e => { setPage(0); setFilters(f => ({ ...f, status: e.target.value })) }}
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <input
          className="bg-dark-2 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold/50 w-36"
          placeholder="City..."
          value={filters.city}
          onChange={e => { setPage(0); setFilters(f => ({ ...f, city: e.target.value })) }}
        />
      </div>

      {/* Priority section — hot leads */}
      {['replied', 'interested'].some(s => data.some(l => l.status === s)) && (
        <div className="card p-4 rounded-xl border-amber-500/20 bg-amber-500/5">
          <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-3">🔥 Needs Your Attention</h2>
          {data.filter(l => ['replied', 'interested'].includes(l.status)).map(lead => (
            <LeadRow key={lead.id} lead={lead} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Main list */}
      <div className="card rounded-xl overflow-hidden">
        <div className="p-4 border-b border-white/6">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider">All Leads</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-white/30 text-sm">Loading leads...</div>
        ) : data.length === 0 ? (
          <div className="p-8 text-center text-white/30 text-sm">
            No leads yet. Run the Lead Finder agent from the Dashboard.
          </div>
        ) : (
          <div className="p-3 space-y-1">
            {data
              .filter(l => !['replied', 'interested'].includes(l.status) || filters.status)
              .map(lead => <LeadRow key={lead.id} lead={lead} onAction={handleAction} />)
            }
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/30">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => p - 1)}
              disabled={page === 0}
              className="btn-ghost px-4 py-2 disabled:opacity-30"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="btn-ghost px-4 py-2 disabled:opacity-30"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
