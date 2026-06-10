import { useState, useEffect } from 'react'
import { salesOps, cron } from '../api/client'

// Internal founders-only Ops Board for the trades sales pipeline. JARVIS dark theme.
const T = {
  bg: '#0a0a0a', panel: 'rgba(0,212,255,0.05)', border: 'rgba(0,212,255,0.16)',
  cyan: '#00d4ff', green: '#00ff88', red: '#ff5470', amber: '#ffb547',
  text: '#e8eef2', muted: '#7a8a99', input: 'rgba(255,255,255,0.04)',
}
const panel = { background: T.panel, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 16 }
const inputStyle = { background: T.input, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '9px 11px', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' }
const btn = (c = T.cyan) => ({ background: 'transparent', border: `1px solid ${c}`, color: c, borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' })
const STATUSES = ['interested', 'demo_booked', 'called', 'not_interested', 'won', 'lost']

export default function Ops() {
  const [key, setKey] = useState(localStorage.getItem('opsKey') || '')
  const [authed, setAuthed] = useState(false)
  const [board, setBoard] = useState(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  // scout
  const [paste, setPaste] = useState('')
  const [town, setTown] = useState('')
  const [trade, setTrade] = useState('plumber')
  const [scoutRes, setScoutRes] = useState(null)
  // inline call logging
  const [outcomes, setOutcomes] = useState({})
  const [statuses, setStatuses] = useState({})
  const [toast, setToast] = useState('')

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const load = async (k) => {
    setLoading(true); setErr('')
    try {
      const b = await salesOps.board(k)
      setBoard(b); setAuthed(true); localStorage.setItem('opsKey', k)
    } catch (e) {
      setErr(e.message || 'Failed to load'); setAuthed(false)
    } finally { setLoading(false) }
  }
  useEffect(() => { if (key) load(key) }, []) // eslint-disable-line

  const runScout = async () => {
    if (!paste.trim()) return
    try { const r = await salesOps.scout(key, { pasted_text: paste, town, trade }); setScoutRes(r); setPaste(''); load(key) }
    catch (e) { flash('Scout failed: ' + e.message) }
  }
  const logCall = async (id) => {
    try {
      await salesOps.log(key, id, { outcome: outcomes[id] || 'called', new_status: statuses[id] || undefined })
      flash('Call logged'); setOutcomes(o => ({ ...o, [id]: '' })); load(key)
    } catch (e) { flash('Log failed: ' + e.message) }
  }
  const prep = async (id) => { try { const r = await salesOps.prep(key, id); flash('Prep ready for ' + (r.prospect || '')); load(key) } catch (e) { flash('Prep failed') } }
  const runMorning = async () => { try { await cron.morning(key); flash('08:00 job fired → Telegram') } catch (e) { flash('Failed: ' + e.message) } }
  const runEvening = async () => { try { const r = await cron.evening(key); flash(`${r.count || 0} follow-up draft(s) → Telegram`) } catch (e) { flash('Failed: ' + e.message) } }

  // ── Key gate ──────────────────────────────────────────────────────
  if (!authed) return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui' }}>
      <div style={{ ...panel, width: 360 }}>
        <h1 style={{ color: T.cyan, fontSize: 20, marginTop: 0 }}>Ops Board · founders only</h1>
        <p style={{ color: T.muted, fontSize: 13 }}>Enter the ops key (OPS_KEY / SECRET_KEY).</p>
        <input style={inputStyle} type="password" value={key} placeholder="ops key"
          onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && load(key)} />
        {err && <div style={{ color: T.red, fontSize: 13, marginTop: 10 }}>{err}</div>}
        <button style={{ ...btn(), marginTop: 14, width: '100%' }} onClick={() => load(key)} disabled={loading}>
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </div>
    </div>
  )

  const r = board?.report || {}
  const pipe = board?.pipeline || {}
  const calls = board?.calls || { D: [], L: [] }

  const Stat = ({ label, value, color = T.text }) => (
    <div style={{ flex: 1, minWidth: 110 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
    </div>
  )

  const CallList = ({ founder, items }) => (
    <div style={{ ...panel, flex: 1, minWidth: 320 }}>
      <h3 style={{ color: T.cyan, marginTop: 0 }}>📞 {founder}’s calls <span style={{ color: T.muted, fontWeight: 400 }}>({items.length})</span></h3>
      {items.length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>List clear.</div>}
      {items.map(p => (
        <div key={p.id} style={{ borderTop: `1px solid ${T.border}`, padding: '10px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ fontWeight: 600 }}>
              {p.priority === 0 ? '⏰ ' : ''}{p.business_name}
              <span style={{ color: T.muted, fontWeight: 400, fontSize: 13 }}>
                {' '}· {[p.trade, p.town].filter(Boolean).join(', ')}
              </span>
            </div>
            <span style={{ color: T.green, fontSize: 12 }}>{p.priority === 0 ? p.reason : `#${p.rank_score}`}</span>
          </div>
          {p.phone && <a href={`tel:${p.phone}`} style={{ color: T.cyan, fontSize: 13, textDecoration: 'none' }}>{p.phone}</a>}
          {p.call_notes && <div style={{ color: T.muted, fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>📝 {p.call_notes.slice(0, 220)}</div>}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <input style={{ ...inputStyle, flex: 2, minWidth: 120, padding: '6px 9px' }} placeholder="call outcome…"
              value={outcomes[p.id] || ''} onChange={e => setOutcomes(o => ({ ...o, [p.id]: e.target.value }))} />
            <select style={{ ...inputStyle, flex: 1, minWidth: 110, padding: '6px 9px' }}
              value={statuses[p.id] || ''} onChange={e => setStatuses(s => ({ ...s, [p.id]: e.target.value }))}>
              <option value="">auto status</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button style={btn(T.green)} onClick={() => logCall(p.id)}>Log</button>
            <button style={btn()} onClick={() => prep(p.id)}>Prep</button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.text, fontFamily: 'Inter, system-ui', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ color: T.cyan, margin: 0, fontSize: 24 }}>TRADES · OPS BOARD</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={btn()} onClick={() => load(key)}>↻ Refresh</button>
          <button style={btn(T.green)} onClick={runMorning}>Run 08:00 (calls+report)</button>
          <button style={btn(T.amber)} onClick={runEvening}>Run 18:00 (follow-ups)</button>
        </div>
      </div>
      {toast && <div style={{ ...panel, borderColor: T.green, color: T.green }}>{toast}</div>}

      {/* Revenue snapshot */}
      <div style={{ ...panel, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <Stat label="Dials yest." value={r.dials_yesterday ?? 0} />
        <Stat label="Trials live" value={r.trials_live ?? 0} color={T.cyan} />
        <Stat label="Paying" value={r.paying_clients ?? 0} color={T.green} />
        <Stat label="MRR" value={`£${(r.mrr ?? 0).toFixed?.(0) ?? r.mrr ?? 0}`} color={T.green} />
        <Stat label="Churn risk" value={r.churn_risk_count ?? 0} color={(r.churn_risk_count ?? 0) > 0 ? T.red : T.text} />
      </div>

      {/* Pipeline */}
      <div style={{ ...panel, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {['to_call', 'called', 'interested', 'demo_booked', 'won', 'not_interested', 'lost'].map(s => (
          <Stat key={s} label={s.replace('_', ' ')} value={pipe[s] ?? 0}
            color={s === 'won' ? T.green : s === 'demo_booked' ? T.cyan : T.text} />
        ))}
      </div>

      {/* Scout */}
      <div style={panel}>
        <h3 style={{ color: T.cyan, marginTop: 0 }}>🔍 Lead Scout — paste a list (name, phone, town — one per line)</h3>
        <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical', fontFamily: 'monospace' }}
          placeholder={"Joe's Plumbing, 07504 683058, Wigan\nSpark Electrical, 01942 123456, Leigh"}
          value={paste} onChange={e => setPaste(e.target.value)} />
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...inputStyle, width: 160 }} placeholder="default town" value={town} onChange={e => setTown(e.target.value)} />
          <input style={{ ...inputStyle, width: 160 }} placeholder="default trade" value={trade} onChange={e => setTrade(e.target.value)} />
          <button style={btn(T.green)} onClick={runScout}>Scout &amp; rank</button>
          {scoutRes && <span style={{ color: T.green, fontSize: 13 }}>{scoutRes.message}</span>}
        </div>
      </div>

      {/* Call lists */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <CallList founder="D" items={calls.D || []} />
        <CallList founder="L" items={calls.L || []} />
      </div>

      {/* Trials */}
      <div style={panel}>
        <h3 style={{ color: T.cyan, marginTop: 0 }}>🧪 Trials</h3>
        {(r.trial_details || []).length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>No live trials.</div>}
        {(r.trial_details || []).map((t, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.border}`, padding: '8px 0' }}>
            <span>{t.business_name}</span>
            <span style={{ color: t.churn_risk ? T.red : T.muted, fontSize: 13 }}>
              {t.days_remaining}d left · {t.leads_captured} leads {t.churn_risk ? '🔴' : ''}
            </span>
          </div>
        ))}
      </div>

      {/* Recent captured leads */}
      <div style={panel}>
        <h3 style={{ color: T.cyan, marginTop: 0 }}>📥 Recent captured leads</h3>
        {(board?.recent_leads || []).length === 0 && <div style={{ color: T.muted, fontSize: 13 }}>None yet.</div>}
        {(board?.recent_leads || []).slice(0, 12).map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${T.border}`, padding: '7px 0', fontSize: 13 }}>
            <span>{l.client_name || '—'} · {l.name || ''} {l.phone}</span>
            <span style={{ color: T.muted }}>{l.source} · {l.status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
