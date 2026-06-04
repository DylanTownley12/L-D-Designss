/**
 * Command Center — Founder's daily action queue.
 * Answers: Who to contact, what to send, what's broken.
 */
import { useState, useEffect } from 'react'
import { ops, payments as paymentsApi, outreach as outreachApi, agents } from '../api/client'
import { Zap, AlertTriangle, CheckCircle2, Phone, AtSign, Copy, ExternalLink, CreditCard, MessageSquare, RefreshCcw, X, ChevronRight, AlertCircle } from 'lucide-react'

const C = {
  bg:      '#02020e',
  panel:   'rgba(0,8,28,0.7)',
  border:  'rgba(0,212,255,0.1)',
  bdim:    'rgba(0,212,255,0.06)',
  cyan:    '#00D4FF',
  gold:    '#D4A843',
  green:   '#00FF88',
  red:     '#FF3355',
  purple:  '#a855f7',
  text:    'rgba(255,255,255,0.88)',
  mid:     'rgba(255,255,255,0.42)',
  dim:     'rgba(255,255,255,0.16)',
  mono:    '"JetBrains Mono", monospace',
}
const lbl = (x = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.dim, fontFamily: C.mono, ...x })
const card = (accent = C.border) => ({ background: C.panel, border: `1px solid ${accent}`, borderRadius: 12, overflow: 'hidden' })

function Toast({ toast }) {
  if (!toast) return null
  return <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: toast.type === 'error' ? 'rgba(255,51,85,0.9)' : `linear-gradient(135deg,${C.gold},#F0C96A)`, color: toast.type === 'error' ? '#fff' : '#000', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>{toast.msg}</div>
}

function BlockerCard({ blocker, onFixed }) {
  const [loading, setLoading] = useState(false)
  const sev = { critical: { color: C.red, bg: 'rgba(255,51,85,0.08)', border: 'rgba(255,51,85,0.25)' }, warning: { color: '#fbbf24', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.2)' }, info: { color: C.mid, bg: 'rgba(255,255,255,0.03)', border: C.bdim } }[blocker.severity] || {}

  const runFix = async () => {
    setLoading(true)
    try {
      const btn = blocker.fix_button
      const res = await fetch(`https://l-d-designss-production.up.railway.app${btn.path}`, {
        method: btn.method, headers: { 'Content-Type': 'application/json' },
        body: btn.body ? JSON.stringify(btn.body) : undefined,
      })
      if (res.ok) onFixed?.()
    } catch (e) { } finally { setLoading(false) }
  }

  return (
    <div style={{ background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={13} color={sev.color} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: sev.color, marginBottom: 3 }}>{blocker.title}</div>
          <div style={{ fontSize: 11.5, color: C.mid, lineHeight: 1.5, marginBottom: 8 }}>{blocker.impact}</div>
          {blocker.fix_type === 'button' && blocker.fix_button && (
            <button onClick={runFix} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 7, border: `1px solid ${sev.border}`, background: sev.bg, color: sev.color, fontSize: 11.5, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1 }}>
              <Zap size={11} /> {loading ? 'Running...' : blocker.fix_button.label}
            </button>
          )}
          {blocker.fix_type === 'human' && blocker.human_steps && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {blocker.human_steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11, color: C.mid }}>
                  <span style={{ color: sev.color, fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionItem({ item, onAction, showToast }) {
  const [loading, setLoading] = useState(false)
  const phone = item.phone ? item.phone.replace(/[\s\-]/g, '') : null
  const waLink = phone ? `https://wa.me/${phone.replace('+', '')}${item.suggested_message ? '?text=' + encodeURIComponent(item.suggested_message) : ''}` : null

  const priorityColors = { 1: { color: C.gold, label: 'PAYMENT DUE', bg: 'rgba(212,168,67,0.08)', border: 'rgba(212,168,67,0.25)' }, 2: { color: '#fcd34d', label: 'FOLLOW UP', bg: 'rgba(252,211,77,0.06)', border: 'rgba(252,211,77,0.2)' }, 3: { color: C.cyan, label: 'FOLLOW UP DUE', bg: 'rgba(0,212,255,0.05)', border: 'rgba(0,212,255,0.15)' }, 4: { color: C.mid, label: 'SEND NOW', bg: 'rgba(255,255,255,0.02)', border: C.bdim } }
  const pc = priorityColors[item.priority] || priorityColors[4]

  const copy = () => { if (item.suggested_message) { navigator.clipboard.writeText(item.suggested_message); showToast('Copied!') } }
  const markSent = async () => {
    if (!item.message_id) return
    setLoading(true)
    try { await outreachApi.markSent(item.message_id); onAction() } catch (e) { showToast(e.message, 'error') } finally { setLoading(false) }
  }
  const sendPaymentLink = async () => {
    setLoading(true)
    try { const r = await paymentsApi.createCheckout(item.lead_id); window.open(r.checkout_url, '_blank'); showToast('Payment link opened') } catch (e) { showToast(e.message, 'error') } finally { setLoading(false) }
  }

  return (
    <div style={{ background: pc.bg, border: `1px solid ${pc.border}`, borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{item.lead_name}</span>
            <span style={{ fontSize: 11, color: C.dim }}>{item.city}</span>
            <span style={{ marginLeft: 'auto', fontSize: 9, padding: '2px 7px', borderRadius: 99, background: `${pc.color}20`, color: pc.color, fontWeight: 700, fontFamily: C.mono }}>{pc.label}</span>
          </div>
          {item.reasons?.length > 0 && <div style={{ fontSize: 11, color: pc.color }}>{item.reasons[0]}</div>}
        </div>
      </div>

      {item.suggested_message && (
        <div style={{ fontSize: 12, color: C.mid, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.55, maxHeight: 80, overflow: 'hidden', position: 'relative' }}>
          {item.suggested_message.slice(0, 200)}{item.suggested_message.length > 200 ? '...' : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {waLink && (
          <button onClick={() => { window.open(waLink, '_blank'); if (item.message_id) markSent() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#25D366,#128C7E)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Phone size={11} /> WhatsApp
          </button>
        )}
        {item.instagram_url && (
          <button onClick={() => { if (item.suggested_message) navigator.clipboard.writeText(item.suggested_message); window.open(item.instagram_url, '_blank'); if (item.message_id) markSent() }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#a855f7,#7c3aed)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <AtSign size={11} /> Instagram
          </button>
        )}
        {item.suggested_message && (
          <button onClick={copy} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.bdim}`, background: 'rgba(255,255,255,0.03)', color: C.mid, fontSize: 12, cursor: 'pointer' }}>
            <Copy size={11} /> Copy
          </button>
        )}
        {item.preview_url && (
          <a href={item.preview_url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, border: `1px solid ${C.bdim}`, background: 'rgba(255,255,255,0.03)', color: C.mid, fontSize: 12, textDecoration: 'none' }}>
            <ExternalLink size={11} /> Preview
          </a>
        )}
        {(item.priority <= 2) && (
          <button onClick={sendPaymentLink} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: `1px solid rgba(212,168,67,0.3)`, background: 'rgba(212,168,67,0.08)', color: C.gold, fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer' }}>
            <CreditCard size={11} /> Send Payment Link
          </button>
        )}
      </div>
    </div>
  )
}

function RevenueStatus() {
  const [stats, setStats] = useState(null)
  useEffect(() => {
    import('../api/client').then(({ dashboard }) => dashboard.stats().then(setStats).catch(() => {}))
  }, [])
  if (!stats) return null
  const items = [
    { label: 'Deposits Paid', value: stats.converted || 0, color: C.green, important: true },
    { label: 'Interested', value: stats.interested || 0, color: C.gold, important: true },
    { label: 'Replied', value: stats.replied || 0, color: '#fcd34d' },
    { label: 'WA Sent', value: stats.outreach_sent || 0, color: C.cyan },
    { label: 'Previews Built', value: stats.preview_ready || 0, color: C.mid },
  ]
  return (
    <div style={{ ...card(C.bdim), padding: '14px 16px', marginBottom: 18 }}>
      <div style={{ ...lbl({ marginBottom: 12 }) }}>Revenue Status (Real Numbers)</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
        {items.map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: item.important ? 24 : 20, fontWeight: 800, color: item.color, fontFamily: C.mono, textShadow: item.important ? `0 0 16px ${item.color}50` : 'none' }}>{item.value}</div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>{item.label}</div>
          </div>
        ))}
      </div>
      {(stats.converted || 0) === 0 && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,51,85,0.06)', border: '1px solid rgba(255,51,85,0.15)', fontSize: 11, color: 'rgba(255,100,100,0.8)', textAlign: 'center' }}>
          £0 collected — keep sending, first client is close
        </div>
      )}
    </div>
  )
}

export default function Command() {
  const [queue, setQueue] = useState([])
  const [blockers, setBlockers] = useState([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const [q, b] = await Promise.all([ops.actionQueue(30), ops.blockers()])
      setQueue(q?.items || [])
      setBlockers(b?.blockers || [])
    } catch (e) { showToast(e.message, 'error') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const criticalBlockers = blockers.filter(b => b.severity === 'critical')
  const warningBlockers = blockers.filter(b => b.severity !== 'critical' && b.severity !== 'info')
  const infoBlockers = blockers.filter(b => b.severity === 'info')

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      <Toast toast={toast} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.gold, boxShadow: `0 0 8px ${C.gold}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
            <span style={lbl({ color: C.gold })}>FOUNDER COMMAND CENTER</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.02em' }}>Do Next</h1>
          <p style={{ fontSize: 12, color: C.mid, marginTop: 3 }}>Your prioritised action queue — work top to bottom</p>
        </div>
        <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.bdim}`, color: C.mid, padding: '7px 12px', borderRadius: 8, cursor: 'pointer' }}>
          <RefreshCcw size={12} /> {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Revenue status */}
      <RevenueStatus />

      {/* Critical blockers — shown at top */}
      {criticalBlockers.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...lbl({ color: C.red, marginBottom: 10 }) }}>🚨 Critical — Fix These Now</div>
          {criticalBlockers.map(b => <BlockerCard key={b.key} blocker={b} onFixed={load} />)}
        </div>
      )}

      {/* Action queue */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Zap size={12} color={C.gold} />
          <span style={lbl({ color: C.gold })}>Action Queue — {queue.length} items</span>
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', color: C.dim, padding: '32px 0', fontFamily: C.mono, fontSize: 11 }}>LOADING QUEUE...</div>
        ) : queue.length === 0 ? (
          <div style={{ ...card(), padding: '32px 24px', textAlign: 'center' }}>
            <CheckCircle2 size={28} color={C.green} style={{ margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 14, color: C.mid }}>Queue is empty — generate more outreach to fill it</div>
          </div>
        ) : (
          queue.map((item, i) => <ActionItem key={`${item.lead_id}-${i}`} item={item} onAction={load} showToast={showToast} />)
        )}
      </div>

      {/* Warnings */}
      {warningBlockers.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...lbl({ color: '#fbbf24', marginBottom: 10 }) }}>⚠ Warnings</div>
          {warningBlockers.map(b => <BlockerCard key={b.key} blocker={b} onFixed={load} />)}
        </div>
      )}

      {/* Info */}
      {infoBlockers.length > 0 && (
        <div>
          <div style={{ ...lbl({ marginBottom: 10 }) }}>Info</div>
          {infoBlockers.map(b => <BlockerCard key={b.key} blocker={b} onFixed={load} />)}
        </div>
      )}
    </div>
  )
}
