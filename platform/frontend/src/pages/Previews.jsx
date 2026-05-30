import { useState, useEffect, useCallback } from 'react'
import { previews as previewsApi, agents } from '../api/client'

const PAGE_SIZE = 50

export default function Previews() {
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const load = useCallback(() => {
    setLoading(true)
    previewsApi.list({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
      .then(d => {
        setData(d.previews || [])
        setTotal(d.total || 0)
      })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  const runBatch = async () => {
    setGenerating(true)
    try {
      await agents.run('preview_generator')
      showToast('Generating previews in background — refreshing shortly')
      setTimeout(load, 6000)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const copyUrl = (url) => {
    navigator.clipboard.writeText(url)
    showToast('URL copied!')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-gold text-black'
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Previews</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {total > 0
              ? `${total} preview websites · page ${page} of ${totalPages}`
              : 'No previews yet'}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={load} disabled={loading} className="btn-ghost text-xs">
            ↻ Refresh
          </button>
          <button onClick={runBatch} disabled={generating} className="btn-gold text-xs">
            {generating ? 'Generating…' : '+ Generate Batch'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="card p-3 rounded-xl text-center">
            <div className="text-2xl font-bold text-gold">{total}</div>
            <div className="text-white/40 text-xs mt-0.5">Total Previews</div>
          </div>
          <div className="card p-3 rounded-xl text-center">
            <div className="text-2xl font-bold text-gold">{data.filter(p => p.leads?.status === 'outreach_sent' || p.leads?.status === 'replied').length}</div>
            <div className="text-white/40 text-xs mt-0.5">Sent This Page</div>
          </div>
          <div className="card p-3 rounded-xl text-center">
            <div className="text-2xl font-bold text-gold">{page}</div>
            <div className="text-white/40 text-xs mt-0.5">of {totalPages} Pages</div>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="text-center text-white/30 py-16 text-sm">Loading previews…</div>
      ) : data.length === 0 ? (
        <div className="card rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🌐</div>
          <h2 className="font-semibold mb-2">No Previews Yet</h2>
          <p className="text-white/40 text-sm mb-6">Run the preview batch to generate websites for your leads.</p>
          <button onClick={runBatch} disabled={generating} className="btn-gold">
            {generating ? 'Generating…' : 'Generate Now'}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {data.map(preview => {
            const name = preview.leads?.business_name
              || preview.personalization_data?.business_name
              || 'Unknown'
            const city = preview.leads?.city
              || preview.personalization_data?.city
              || '—'
            const status = preview.leads?.status
            const hasHtml = !!preview.html_content && preview.html_content.length > 1000

            return (
              <div key={preview.id} className="card rounded-xl overflow-hidden group border border-white/5 hover:border-gold/20 transition-all">
                {/* Thumbnail */}
                <div className="h-32 bg-dark-3 relative flex items-center justify-center overflow-hidden">
                  <div className="text-4xl opacity-20">🌐</div>
                  <div className="absolute inset-0 bg-gradient-to-br from-gold/8 to-transparent"></div>
                  {/* Status badge */}
                  {status && (
                    <div className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      status === 'replied'   ? 'bg-amber-500/20 text-amber-400' :
                      status === 'interested' ? 'bg-purple-500/20 text-purple-400' :
                      status === 'converted' ? 'bg-emerald-500/20 text-emerald-400' :
                      status === 'outreach_sent' ? 'bg-cyan-500/20 text-cyan-400' :
                      'bg-white/10 text-white/40'
                    }`}>
                      {status.replace('_', ' ')}
                    </div>
                  )}
                  {!hasHtml && (
                    <div className="absolute top-2 right-2 text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">
                      needs regen
                    </div>
                  )}
                  {/* Open button on hover */}
                  <a
                    href={preview.preview_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40"
                  >
                    <span className="bg-gold text-black font-bold text-xs px-3 py-1.5 rounded-full">
                      Open Preview →
                    </span>
                  </a>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="font-medium text-sm truncate mb-0.5">{name}</div>
                  <div className="text-white/40 text-xs mb-3">{city}</div>

                  <div className="flex gap-1.5">
                    <a
                      href={preview.preview_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-gold flex-1 text-center py-1.5 text-xs"
                    >
                      View
                    </a>
                    <button
                      onClick={() => copyUrl(preview.preview_url)}
                      className="btn-ghost px-2.5 py-1.5 text-xs"
                      title="Copy URL"
                    >
                      📋
                    </button>
                  </div>
                  <div className="text-white/20 text-[10px] mt-2">
                    {new Date(preview.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-sm text-white/40">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="btn-ghost text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="px-3 py-1.5 text-sm text-white/50">{page} / {totalPages}</span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="btn-ghost text-sm disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
