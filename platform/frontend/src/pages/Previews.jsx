import { useState, useEffect, useCallback } from 'react'
import { previews as previewsApi, agents } from '../api/client'
import { Globe, Copy, RefreshCcw, ExternalLink, Plus, AlertCircle } from 'lucide-react'

const PAGE_SIZE = 50

const STATUS_DOT = {
  replied:       { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', dot: '#f59e0b', label: 'replied' },
  interested:    { bg: 'rgba(168,85,247,0.15)',  color: '#d8b4fe', dot: '#a855f7', label: 'interested' },
  converted:     { bg: 'rgba(16,185,129,0.15)',  color: '#6ee7b7', dot: '#10b981', label: 'converted' },
  outreach_sent: { bg: 'rgba(6,182,212,0.12)',   color: '#22d3ee', dot: '#06b6d4', label: 'sent' },
}

function PreviewCard({ preview, onCopy }) {
  const [hovered, setHovered] = useState(false)
  const name = preview.leads?.business_name || preview.personalization_data?.business_name || 'Unknown'
  const city = preview.leads?.city || preview.personalization_data?.city || '—'
  const status = preview.leads?.status
  const hasHtml = !!preview.html_content && preview.html_content.length > 1000
  const statusMeta = STATUS_DOT[status]
  const initial = name.charAt(0).toUpperCase()

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#0c0c12',
        border: `1px solid ${hovered ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'all 0.18s ease',
        boxShadow: hovered ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 120,
        background: `linear-gradient(135deg, rgba(212,168,67,0.06) 0%, rgba(124,58,237,0.04) 100%)`,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {/* Grid pattern */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.08,
          backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        }} />
        {/* Browser chrome mock */}
        <div style={{
          width: '80%',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: 8,
          padding: '8px 10px',
          border: '1px solid rgba(255,255,255,0.06)',
          position: 'relative',
        }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(239,68,68,0.4)' }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(245,158,11,0.4)' }} />
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(16,185,129,0.4)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 6,
              background: 'rgba(212,168,67,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#D4A843', flexShrink: 0,
            }}>
              {initial}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 5, background: 'rgba(255,255,255,0.15)', borderRadius: 99, marginBottom: 4, width: '75%' }} />
              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, width: '50%' }} />
            </div>
          </div>
        </div>

        {/* Status badge */}
        {statusMeta && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
            background: statusMeta.bg, color: statusMeta.color,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusMeta.dot, display: 'inline-block' }} />
            {statusMeta.label}
          </div>
        )}

        {/* Needs regen warning */}
        {!hasHtml && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            fontSize: 10, background: 'rgba(239,68,68,0.2)', color: '#fca5a5',
            padding: '2px 8px', borderRadius: 999, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <AlertCircle size={9} /> regen
          </div>
        )}

        {/* Hover overlay */}
        {hovered && (
          <a
            href={preview.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.5)',
              textDecoration: 'none',
            }}
          >
            <span style={{
              background: 'linear-gradient(135deg, #D4A843, #F0C96A)',
              color: '#000', fontWeight: 700, fontSize: 11,
              padding: '6px 14px', borderRadius: 99,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <ExternalLink size={11} /> Open Preview
            </span>
          </a>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 12 }}>{city}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a
            href={preview.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold"
            style={{ flex: 1, textAlign: 'center', justifyContent: 'center', padding: '6px 10px', fontSize: 11 }}
          >
            <Globe size={11} /> View
          </a>
          <button
            onClick={() => onCopy(preview.preview_url)}
            className="btn-ghost"
            style={{ width: 32, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            title="Copy URL"
          >
            <Copy size={12} />
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8, fontFamily: '"JetBrains Mono", monospace' }}>
          {new Date(preview.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}

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
      .then(d => { setData(d.previews || []); setTotal(d.total || 0) })
      .catch(e => showToast(e.message, 'error'))
      .finally(() => setLoading(false))
  }, [page])

  useEffect(() => { load() }, [load])

  const runBatch = async () => {
    setGenerating(true)
    try {
      await agents.run('preview_generator')
      showToast('Generating previews — refreshing shortly')
      setTimeout(load, 6000)
    } catch (e) { showToast(e.message, 'error') }
    finally { setGenerating(false) }
  }

  const copyUrl = url => {
    navigator.clipboard.writeText(url)
    showToast('URL copied!')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
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
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.9)' }}>Previews</h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>
            {total > 0 ? `${total} preview websites · page ${page} of ${totalPages}` : 'No previews yet'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} className="btn-ghost" style={{ fontSize: 12 }}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <button onClick={runBatch} disabled={generating} className="btn-gold" style={{ fontSize: 12 }}>
            {generating ? (
              <><div style={{ width: 12, height: 12, border: '1.5px solid rgba(0,0,0,0.4)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Generating...</>
            ) : (
              <><Plus size={12} /> Generate Batch</>
            )}
          </button>
        </div>
      </div>

      {/* Stats */}
      {total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total Previews', value: total, color: '#D4A843' },
            { label: 'Sent This Page', value: data.filter(p => ['outreach_sent','replied'].includes(p.leads?.status)).length, color: '#06b6d4' },
            { label: 'Pages', value: `${page} of ${totalPages}`, color: '#a855f7' },
          ].map(s => (
            <div key={s.label} style={{
              background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 12, padding: '14px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', padding: '64px 0', fontSize: 13 }}>Loading previews...</div>
      ) : data.length === 0 ? (
        <div style={{
          background: '#0c0c12', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '64px 24px', textAlign: 'center',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'rgba(212,168,67,0.08)',
            border: '1px solid rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Globe size={24} color="#D4A843" style={{ opacity: 0.6 }} />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>No Previews Yet</h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>Run the preview batch to generate websites for your leads.</p>
          <button onClick={runBatch} disabled={generating} className="btn-gold">
            {generating ? 'Generating...' : 'Generate Now'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {data.map(preview => (
            <PreviewCard key={preview.id} preview={preview} onCopy={copyUrl} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn-ghost" style={{ fontSize: 12 }}>← Prev</button>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', padding: '6px 8px' }}>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn-ghost" style={{ fontSize: 12 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
