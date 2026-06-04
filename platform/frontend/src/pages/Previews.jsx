import { useState, useEffect, useCallback } from 'react'
import { previews as previewsApi, agents, n8n as n8nApi } from '../api/client'
import { Globe, Copy, RefreshCcw, ExternalLink, Plus, AlertCircle, Eye, Flame, Zap, Clock } from 'lucide-react'

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

const PAGE_SIZE = 50

const STATUS_DOT = {
  replied:       { bg: 'rgba(245,158,11,0.15)',  color: '#fbbf24', dot: '#f59e0b', label: 'replied' },
  interested:    { bg: 'rgba(168,85,247,0.15)',  color: '#d8b4fe', dot: '#a855f7', label: 'interested' },
  converted:     { bg: 'rgba(16,185,129,0.15)',  color: '#6ee7b7', dot: '#10b981', label: 'converted' },
  outreach_sent: { bg: 'rgba(6,182,212,0.12)',   color: '#22d3ee', dot: '#06b6d4', label: 'sent' },
}

function isHot(last_viewed_at) {
  if (!last_viewed_at) return false
  return Date.now() - new Date(last_viewed_at).getTime() < 86400000 // 24h
}

function relTime(iso) {
  if (!iso) return null
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function PreviewCard({ preview, onCopy }) {
  const [hovered, setHovered] = useState(false)
  const name = preview.leads?.business_name || preview.personalization_data?.business_name || 'Unknown'
  const city = preview.leads?.city || preview.personalization_data?.city || '—'
  const status = preview.leads?.status
  const hasHtml = !!preview.html_content && preview.html_content.length > 1000
  const statusMeta = STATUS_DOT[status]
  const initial = name.charAt(0).toUpperCase()
  const hot = isHot(preview.last_viewed_at)
  const views = preview.view_count || 0

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#0c0c12',
        border: `1px solid ${hot ? 'rgba(255,51,85,0.3)' : hovered ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        transition: 'all 0.18s ease',
        boxShadow: hot ? '0 0 20px rgba(255,51,85,0.08)' : hovered ? '0 4px 20px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.2)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 120,
        background: hot
          ? 'linear-gradient(135deg, rgba(255,51,85,0.08) 0%, rgba(212,168,67,0.06) 100%)'
          : 'linear-gradient(135deg, rgba(212,168,67,0.06) 0%, rgba(124,58,237,0.04) 100%)',
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
          backgroundSize: '24px 24px', pointerEvents: 'none',
        }} />

        {/* Browser chrome mock */}
        <div style={{
          width: '80%', background: 'rgba(255,255,255,0.05)',
          borderRadius: 8, padding: '8px 10px',
          border: '1px solid rgba(255,255,255,0.06)', position: 'relative',
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

        {/* HOT badge */}
        {hot && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
            background: 'rgba(255,51,85,0.2)', color: '#ff6680',
            border: '1px solid rgba(255,51,85,0.3)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Flame size={9} color="#ff6680" /> HOT
          </div>
        )}

        {/* Status badge */}
        {!hot && statusMeta && (
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

        {/* View count */}
        {views > 0 && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            fontSize: 10, padding: '2px 8px', borderRadius: 999,
            background: hot ? 'rgba(255,51,85,0.15)' : 'rgba(0,212,255,0.1)',
            color: hot ? '#ff6680' : C.cyan,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Eye size={9} /> {views}
          </div>
        )}

        {/* Needs regen warning */}
        {!hasHtml && !hot && (
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
          <a href={preview.preview_url} target="_blank" rel="noopener noreferrer" style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)', textDecoration: 'none',
          }}>
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
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: hot ? 6 : 12 }}>{city}</div>

        {/* Last viewed */}
        {preview.last_viewed_at && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
            <Clock size={10} color={hot ? '#ff6680' : C.textDim} />
            <span style={{ fontSize: 10, color: hot ? '#ff6680' : C.textDim, fontFamily: C.mono }}>
              viewed {relTime(preview.last_viewed_at)}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 6 }}>
          <a
            href={preview.preview_url} target="_blank" rel="noopener noreferrer"
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
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 8, fontFamily: C.mono }}>
          {new Date(preview.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}

/* ── Intent Tracker Panel ── */
function IntentTracker({ data }) {
  const hotLeads = data.filter(p => isHot(p.last_viewed_at))
  const viewedToday = data.filter(p => p.view_count > 0)
  const totalViews = data.reduce((a, p) => a + (p.view_count || 0), 0)

  if (totalViews === 0 && hotLeads.length === 0) return null

  return (
    <div style={{ ...panel({ overflow: 'hidden', marginBottom: 20 }) }}>
      <div style={{
        padding: '12px 18px', borderBottom: `1px solid ${C.borderDim}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.red, boxShadow: `0 0 8px ${C.red}`, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
        <Flame size={12} color="#ff6680" />
        <span style={{ ...label(), color: 'rgba(255,102,128,0.7)', fontSize: 9 }}>INTENT TRACKER — REAL BUYER SIGNALS</span>
        {hotLeads.length > 0 && (
          <span style={{
            marginLeft: 'auto', fontSize: 10, padding: '2px 10px', borderRadius: 99,
            background: 'rgba(255,51,85,0.1)', color: '#ff6680',
            border: '1px solid rgba(255,51,85,0.2)', fontFamily: C.mono,
          }}>
            {hotLeads.length} HOT in 24h
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${C.borderDim}` }}>
        {[
          { lbl: 'Total Views', value: totalViews, color: C.cyan, icon: <Eye size={12} color={C.cyan} /> },
          { lbl: 'Previews Viewed', value: viewedToday.length, color: '#a855f7', icon: <Globe size={12} color="#a855f7" /> },
          { lbl: 'Hot (24h)', value: hotLeads.length, color: '#ff6680', icon: <Flame size={12} color="#ff6680" /> },
        ].map(s => (
          <div key={s.lbl} style={{ padding: '14px 18px', borderRight: `1px solid ${C.borderDim}`, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 6 }}>
              {s.icon}
              <span style={{ ...label(), fontSize: 7.5, color: s.color + '88' }}>{s.lbl}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, fontFamily: C.mono, letterSpacing: '-0.03em', textShadow: `0 0 16px ${s.color}50` }}>{s.value}</div>
          </div>
        ))}
      </div>

      {hotLeads.length > 0 && (
        <div>
          {hotLeads.slice(0, 5).map((p, i) => {
            const name = p.leads?.business_name || 'Unknown'
            const city = p.leads?.city || '—'
            const status = p.leads?.status
            const statusMeta = STATUS_DOT[status]
            return (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '9px 18px',
                borderBottom: i < hotLeads.slice(0, 5).length - 1 ? `1px solid ${C.borderDim}` : 'none',
                background: 'rgba(255,51,85,0.02)',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff6680', flexShrink: 0, boxShadow: '0 0 6px rgba(255,51,85,0.5)' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{name}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>{city}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {statusMeta && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: statusMeta.bg, color: statusMeta.color }}>
                      {statusMeta.label}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: C.cyan, fontFamily: C.mono }}>
                    <Eye size={9} /> {p.view_count}
                  </span>
                  <span style={{ fontSize: 10, color: '#ff6680', fontFamily: C.mono }}>
                    {relTime(p.last_viewed_at)}
                  </span>
                  {p.preview_url && (
                    <a href={p.preview_url} target="_blank" rel="noopener noreferrer" style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, color: C.gold, background: 'rgba(212,168,67,0.08)',
                      border: `1px solid rgba(212,168,67,0.2)`,
                      padding: '2px 8px', borderRadius: 6, textDecoration: 'none', fontWeight: 600,
                    }}>
                      <ExternalLink size={9} /> Open
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
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
  const [filter, setFilter] = useState('all')

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

  // Filter data
  const filtered = filter === 'hot'
    ? data.filter(p => isHot(p.last_viewed_at))
    : filter === 'viewed'
    ? data.filter(p => (p.view_count || 0) > 0)
    : filter === 'interested'
    ? data.filter(p => ['replied', 'interested'].includes(p.leads?.status))
    : data

  const hotCount = data.filter(p => isHot(p.last_viewed_at)).length
  const viewedCount = data.filter(p => (p.view_count || 0) > 0).length

  const FILTERS = [
    { key: 'all', label: 'All', count: data.length },
    { key: 'hot', label: '🔥 Hot', count: hotCount },
    { key: 'viewed', label: 'Viewed', count: viewedCount },
    { key: 'interested', label: 'Interested', count: data.filter(p => ['replied','interested'].includes(p.leads?.status)).length },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={label()}>PREVIEW ASSETS</span>
            {hotCount > 0 && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '2px 10px', borderRadius: 99,
                background: 'rgba(255,51,85,0.1)', color: '#ff6680',
                border: '1px solid rgba(255,51,85,0.2)', fontSize: 10, fontWeight: 700,
              }}>
                <Flame size={9} /> {hotCount} hot
              </span>
            )}
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text }}>Previews</h1>
          <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
            {total > 0 ? `${total} preview websites · page ${page} of ${totalPages}` : 'No previews yet'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.borderDim}`, color: C.textMid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
            <RefreshCcw size={12} /> Refresh
          </button>
          <button onClick={runBatch} disabled={generating} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: `linear-gradient(135deg, ${C.gold}, #F0C96A)`, border: 'none', color: '#000', fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: generating ? 'not-allowed' : 'pointer' }}>
            {generating ? (
              <><div style={{ width: 12, height: 12, border: '1.5px solid rgba(0,0,0,0.4)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Generating...</>
            ) : (
              <><Plus size={12} /> Generate Batch</>
            )}
          </button>
        </div>
      </div>

      {/* Intent Tracker */}
      {!loading && <IntentTracker data={data} />}

      {/* Stats */}
      {total > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
          {[
            { lbl: 'Total', value: total, color: C.gold },
            { lbl: 'Hot (24h)', value: hotCount, color: '#ff6680' },
            { lbl: 'Viewed', value: viewedCount, color: C.cyan },
            { lbl: 'Page', value: `${page}/${totalPages}`, color: '#a855f7' },
          ].map(s => (
            <div key={s.lbl} style={{ ...panel({ padding: '12px 16px', textAlign: 'center', position: 'relative', overflow: 'hidden' }) }}>
              <div style={{ ...label(), marginBottom: 4, fontSize: 7.5 }}>{s.lbl}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: C.mono, letterSpacing: '-0.03em', textShadow: `0 0 12px ${s.color}50` }}>{s.value}</div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 40, background: `radial-gradient(circle at 100% 100%, ${s.color}12 0%, transparent 70%)`, pointerEvents: 'none' }} />
            </div>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: filter === f.key ? (f.key === 'hot' ? 'rgba(255,51,85,0.15)' : `rgba(0,212,255,0.1)`) : 'rgba(255,255,255,0.04)',
                border: filter === f.key ? (f.key === 'hot' ? '1px solid rgba(255,51,85,0.3)' : `1px solid ${C.border}`) : `1px solid ${C.borderDim}`,
                color: filter === f.key ? (f.key === 'hot' ? '#ff6680' : C.cyan) : C.textMid,
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {f.label}
              <span style={{ fontSize: 10, opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', color: C.textMid, padding: '64px 0', fontSize: 13, fontFamily: C.mono, letterSpacing: '0.1em' }}>LOADING PREVIEWS...</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...panel({ padding: '64px 24px', textAlign: 'center' }) }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'rgba(212,168,67,0.08)',
            border: '1px solid rgba(212,168,67,0.15)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Globe size={24} color="#D4A843" style={{ opacity: 0.6 }} />
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>
            {filter === 'hot' ? 'No Hot Previews' : filter === 'viewed' ? 'No Views Yet' : 'No Previews Yet'}
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>
            {filter === 'all' ? 'Run the preview batch to generate websites for your leads.' : 'Send more outreach — views appear when barbers open their preview link.'}
          </p>
          {filter === 'all' && (
            <button onClick={runBatch} disabled={generating} className="btn-gold">
              {generating ? 'Generating...' : 'Generate Now'}
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {filtered.map(preview => (
            <PreviewCard key={preview.id} preview={preview} onCopy={copyUrl} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && filter === 'all' && (
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
