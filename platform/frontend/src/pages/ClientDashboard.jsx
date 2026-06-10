import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { portal } from '../api/client'

const C = {
  stone: '#F6F4EF', ink: '#15171C', navy: '#1C3D5E', white: '#fff',
  line: 'rgba(21,23,28,0.10)', muted: '#5b5f66', green: '#1f7a4d', amber: '#a6731a', red: '#b3261e',
}
const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost']
const STATUS_COLOR = { new: C.navy, contacted: C.amber, quoted: C.amber, won: C.green, lost: C.muted }
const serif = { fontFamily: 'Fraunces, Georgia, serif' }

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function ClientDashboard() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    portal.dashboard(token).then(setData).catch(() => setNotFound(true))
  }, [token])
  useEffect(() => { load() }, [load])

  const setStatus = async (leadId, status) => {
    setBusy(leadId)
    try {
      await portal.setLeadStatus(token, leadId, status)
      setData(d => ({ ...d, leads: d.leads.map(l => l.id === leadId ? { ...l, status } : l) }))
    } catch (e) { /* keep UI; surfaced via reload */ }
    finally { setBusy('') }
  }

  const wrap = { minHeight: '100vh', background: C.stone, color: C.ink, fontFamily: 'Inter, system-ui, sans-serif' }

  if (notFound) return (
    <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ ...serif, fontSize: 26 }}>Dashboard not found</h1>
        <p style={{ color: C.muted }}>This link isn’t valid.</p>
      </div>
    </div>
  )
  if (!data) return <div style={{ ...wrap, padding: 40, color: C.muted }}>Loading…</div>

  const bs = data.leads_by_status || {}
  const newCount = bs.new || 0

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 18px 60px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', color: C.navy, fontWeight: 700 }}>
              Your leads
            </div>
            <h1 style={{ ...serif, fontSize: 30, margin: '4px 0 0' }}>{data.business_name}</h1>
          </div>
          {data.plan_status === 'trial' && data.trial_days_remaining != null && (
            <div style={{
              background: data.trial_days_remaining < 3 ? '#fbe9e7' : '#eef3f7',
              color: data.trial_days_remaining < 3 ? C.red : C.navy,
              padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            }}>
              Free trial · {data.trial_days_remaining} day{data.trial_days_remaining === 1 ? '' : 's'} left
            </div>
          )}
          {data.plan_status === 'paying' && (
            <div style={{ background: '#e8f3ec', color: C.green, padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
              Active · £{data.monthly_fee}/mo
            </div>
          )}
        </div>

        {/* Stat strip */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
          {[['Total', data.total_leads], ['New', newCount], ['Won', bs.won || 0]].map(([k, v]) => (
            <div key={k} style={{ flex: 1, minWidth: 90, background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontSize: 26, fontWeight: 700, ...serif }}>{v}</div>
              <div style={{ fontSize: 12, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{k}</div>
            </div>
          ))}
        </div>

        {/* Leads */}
        <h2 style={{ ...serif, fontSize: 18, margin: '28px 0 12px' }}>Enquiries</h2>
        {data.leads.length === 0 && (
          <div style={{ background: C.white, border: `1px dashed ${C.line}`, borderRadius: 12, padding: 28, textAlign: 'center', color: C.muted }}>
            No enquiries yet. When someone calls and you miss it — or fills your form — they’ll appear here instantly.
          </div>
        )}
        {data.leads.map(l => (
          <div key={l.id} style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 12, padding: '16px 18px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 17 }}>
                {l.name || 'New enquiry'}
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginLeft: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {l.source === 'missed_call' ? '📞 missed call' : '📝 form'}
                </span>
              </div>
              <span style={{ fontSize: 12, color: C.muted }}>{timeAgo(l.created_at)}</span>
            </div>
            <div style={{ marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <a href={`tel:${l.phone}`} style={{ color: C.navy, fontWeight: 600, textDecoration: 'none', fontSize: 16 }}>📞 {l.phone}</a>
              {l.postcode && <span style={{ color: C.muted, fontSize: 14 }}>📍 {l.postcode}</span>}
            </div>
            {l.job_description && <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.45 }}>{l.job_description}</p>}

            <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s} disabled={busy === l.id} onClick={() => setStatus(l.id, s)} style={{
                  padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  textTransform: 'capitalize',
                  border: `1px solid ${l.status === s ? (STATUS_COLOR[s] || C.navy) : C.line}`,
                  background: l.status === s ? (STATUS_COLOR[s] || C.navy) : C.white,
                  color: l.status === s ? '#fff' : C.muted,
                }}>{s}</button>
              ))}
            </div>
          </div>
        ))}

        <p style={{ textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 30 }}>
          Powered by L&D Designs · missed-call text-back
        </p>
      </div>
    </div>
  )
}
