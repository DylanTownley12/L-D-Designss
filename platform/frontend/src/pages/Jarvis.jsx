import { useState, useEffect, useRef, useCallback } from 'react'
import { salesOps, cron } from '../api/client'

// ════════════════════════════════════════════════════════════════════
//  J.A.R.V.I.S — standalone trades operations OS. No app chrome.
//  Live command terminal (→ /api/jarvis/command) + intel panels +
//  a call queue that writes straight to the DB. Founders only (ops key).
// ════════════════════════════════════════════════════════════════════
const C = {
  bg: '#05070a', panelBg: 'rgba(0,212,255,0.035)', border: 'rgba(0,212,255,0.18)',
  borderSoft: 'rgba(0,212,255,0.10)', cyan: '#00d4ff', green: '#00ff88',
  red: '#ff5470', amber: '#ffb547', text: '#dfe9f0', muted: '#6b7d8c',
  inputBg: 'rgba(255,255,255,0.03)',
}
const mono = "'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, monospace"
const ui = "Inter, system-ui, sans-serif"

const panel = {
  background: C.panelBg, border: `1px solid ${C.border}`, borderRadius: 12,
  padding: 16, backdropFilter: 'blur(6px)',
}
const inputStyle = {
  background: C.inputBg, border: `1px solid ${C.border}`, color: C.text,
  borderRadius: 8, padding: '9px 11px', fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: ui,
}
const btn = (c = C.cyan) => ({
  background: 'transparent', border: `1px solid ${c}`, color: c, borderRadius: 8,
  padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: ui,
})
const STATUSES = ['interested', 'demo_booked', 'called', 'not_interested', 'won', 'lost']
const SUGGESTIONS = ['status', "who's next", 'today', 'draft a follow-up for', 'prep', 'scout']

// Cinematic keyframes — injected once.
const FX = `
@keyframes jblink { 0%,49%{opacity:1} 50%,100%{opacity:0} }
@keyframes jpulse { 0%,100%{opacity:.5} 50%{opacity:1} }
@keyframes jscan { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
@keyframes jfade { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:none} }
@keyframes jboot { from{opacity:0} to{opacity:1} }
.jline{ animation: jfade .25s ease both; }
.jdot{ animation: jpulse 1.6s ease-in-out infinite; }
.jcursor{ animation: jblink 1s step-end infinite; }
.jglow{ text-shadow: 0 0 12px rgba(0,212,255,.55), 0 0 30px rgba(0,212,255,.25); }
::-webkit-scrollbar{ width:8px; height:8px; }
::-webkit-scrollbar-thumb{ background: rgba(0,212,255,.2); border-radius:8px; }
`

export default function Jarvis() {
  const [key, setKey] = useState(localStorage.getItem('opsKey') || '')
  const [authed, setAuthed] = useState(false)
  const [authErr, setAuthErr] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const [founder, setFounder] = useState(localStorage.getItem('jarvisFounder') || 'D')
  const [board, setBoard] = useState(null)
  const [clock, setClock] = useState(new Date())

  const [lines, setLines] = useState([])     // {role:'sys'|'you'|'jarvis'|'err', text}
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [outcomes, setOutcomes] = useState({})
  const [statuses, setStatuses] = useState({})
  const [busy, setBusy] = useState('')        // footer action label while running

  const scrollRef = useRef(null)
  const model = board?._model || 'claude'

  // ── data ──────────────────────────────────────────────────────────
  const loadBoard = useCallback(async (k = key) => {
    try { const b = await salesOps.board(k); setBoard(b); return b }
    catch (e) { /* keep last board on transient errors */ return null }
  }, [key])

  const unlock = async (k) => {
    setAuthBusy(true); setAuthErr('')
    try {
      const b = await salesOps.board(k)
      setBoard(b); setAuthed(true); localStorage.setItem('opsKey', k)
      setLines([
        { role: 'sys', text: 'J.A.R.V.I.S online. Trades operations core initialised.' },
        { role: 'sys', text: `Authenticated as founder ${founder}. Type a command or tap a chip.` },
      ])
    } catch (e) {
      setAuthErr(e.message || 'Authentication failed'); setAuthed(false)
    } finally { setAuthBusy(false) }
  }

  useEffect(() => { if (key) unlock(key) }, [])            // eslint-disable-line
  useEffect(() => {                                        // live clock
    const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t)
  }, [])
  useEffect(() => {                                        // poll board every 20s
    if (!authed) return
    const t = setInterval(() => loadBoard(), 20000); return () => clearInterval(t)
  }, [authed, loadBoard])
  useEffect(() => {                                        // auto-scroll terminal
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [lines, thinking])

  const pushLine = (role, text) => setLines(l => [...l, { role, text }])

  // ── command terminal ──────────────────────────────────────────────
  const send = async (raw) => {
    const text = (raw ?? input).trim()
    if (!text || thinking) return
    setInput(''); pushLine('you', text); setThinking(true)
    try {
      const r = await salesOps.command(key, text, founder)
      pushLine('jarvis', r.reply || '…')
      loadBoard()                                          // a write may have changed the board
    } catch (e) {
      pushLine('err', e.message || 'Command failed')
    } finally { setThinking(false) }
  }

  // ── call-queue writes ─────────────────────────────────────────────
  const logCall = async (id) => {
    try {
      await salesOps.log(key, id, { outcome: outcomes[id] || 'called', new_status: statuses[id] || undefined })
      setOutcomes(o => ({ ...o, [id]: '' })); pushLine('sys', 'Call logged.'); loadBoard()
    } catch (e) { pushLine('err', 'Log failed: ' + e.message) }
  }
  const prep = async (id) => {
    try { const r = await salesOps.prep(key, id); pushLine('sys', `Prep ready: ${r.prospect || ''}`); loadBoard() }
    catch (e) { pushLine('err', 'Prep failed: ' + e.message) }
  }

  // ── footer ops ────────────────────────────────────────────────────
  const run = async (label, fn) => {
    setBusy(label)
    try { const r = await fn(); pushLine('sys', typeof r === 'string' ? r : (r?.message || `${label} done.`)) }
    catch (e) { pushLine('err', `${label} failed: ${e.message}`) }
    finally { setBusy('') }
  }
  const seed = () => run('Seed', async () => {
    const r = await salesOps.seedDemo(key)
    await loadBoard()
    const d = r.demo_client || {}
    pushLine('sys', `Seeded ${r.prospects?.added ?? 0} prospect(s). Demo client → ${d.business_name}`)
    if (d.capture_url) pushLine('sys', `Capture form: ${d.capture_url}`)
    if (d.dashboard_url) pushLine('sys', `Client dashboard: ${d.dashboard_url}`)
    return 'Demo dataset ready.'
  })

  const switchFounder = (f) => { setFounder(f); localStorage.setItem('jarvisFounder', f) }

  // ════════════════════════════════════════════════════════════════
  //  ACCESS GATE
  // ════════════════════════════════════════════════════════════════
  if (!authed) return (
    <div style={shell}>
      <style>{FX}</style>
      <Scanline />
      <div style={{ position: 'relative', zIndex: 2, minHeight: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontFamily: ui }}>
        <div style={{ ...panel, width: 380, textAlign: 'center' }}>
          <div className="jglow" style={{ color: C.cyan, fontFamily: mono, fontSize: 30, fontWeight: 800, letterSpacing: 6 }}>
            J.A.R.V.I.S
          </div>
          <div style={{ color: C.muted, fontSize: 12, letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' }}>
            Trades Operations Core
          </div>
          <div style={{ color: C.muted, fontSize: 13, margin: '20px 0 10px' }}>Authenticate — ops key</div>
          <input style={{ ...inputStyle, fontFamily: mono, textAlign: 'center', letterSpacing: 2 }} type="password"
            value={key} placeholder="• • • • • • • •" autoFocus
            onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && unlock(key)} />
          {authErr && <div style={{ color: C.red, fontSize: 12, marginTop: 10 }}>{authErr}</div>}
          <button style={{ ...btn(), marginTop: 16, width: '100%', padding: '11px' }}
            onClick={() => unlock(key)} disabled={authBusy}>
            {authBusy ? 'Authenticating…' : 'Initialise'}
          </button>
          <a href="/command" style={{ color: C.muted, fontSize: 11, display: 'block', marginTop: 14, textDecoration: 'none' }}>
            ← back to L&D dashboard
          </a>
        </div>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════
  //  MAIN OS
  // ════════════════════════════════════════════════════════════════
  const r = board?.report || {}
  const pipe = board?.pipeline || {}
  const calls = board?.calls || { D: [], L: [] }
  const trials = r.trial_details || []
  const leads = board?.recent_leads || []
  const empty = !Object.values(pipe).some(v => v > 0) && !(calls.D?.length || calls.L?.length)

  return (
    <div style={shell}>
      <style>{FX}</style>
      <Scanline />
      <div style={{ position: 'relative', zIndex: 2, padding: '16px 20px 40px', fontFamily: ui, color: C.text }}>

        {/* ── top bar ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="jglow" style={{ color: C.cyan, fontFamily: mono, fontSize: 22, fontWeight: 800, letterSpacing: 4 }}>
              J.A.R.V.I.S
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: C.green, fontFamily: mono, letterSpacing: 1 }}>
              <span className="jdot" style={{ width: 7, height: 7, borderRadius: 99, background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
              ONLINE
            </span>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: mono }}>{model}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: mono, fontSize: 13, color: C.muted, letterSpacing: 1 }}>
              {clock.toLocaleTimeString('en-GB')}
            </span>
            <div style={{ display: 'flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              {['D', 'L'].map(f => (
                <button key={f} onClick={() => switchFounder(f)} style={{
                  background: founder === f ? C.cyan : 'transparent', color: founder === f ? '#05070a' : C.muted,
                  border: 'none', padding: '6px 14px', fontWeight: 800, cursor: 'pointer', fontSize: 12, fontFamily: mono,
                }}>{f}</button>
              ))}
            </div>
            <button style={btn()} onClick={() => loadBoard()}>↻</button>
            <a href="/command" style={{ ...btn(C.muted), textDecoration: 'none', display: 'inline-block' }}>Exit</a>
          </div>
        </div>

        {empty && (
          <div style={{ ...panel, borderColor: C.amber, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ color: C.amber, fontFamily: mono, fontSize: 13 }}>⚠ No pipeline data. Initialise the demo dataset to populate 30 local prospects + a live demo client.</span>
            <button style={btn(C.amber)} onClick={seed} disabled={busy === 'Seed'}>{busy === 'Seed' ? 'Seeding…' : 'Initialise demo'}</button>
          </div>
        )}

        {/* ── main grid: console | intel ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) minmax(0,1fr)', gap: 16, alignItems: 'start' }}>

          {/* CONSOLE */}
          <div style={{ ...panel, display: 'flex', flexDirection: 'column', height: 460 }}>
            <SectionTitle>Command Console</SectionTitle>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', fontFamily: mono, fontSize: 13, lineHeight: 1.55, padding: '4px 2px' }}>
              {lines.map((l, i) => <TermLine key={i} role={l.role} text={l.text} />)}
              {thinking && <div className="jline" style={{ color: C.cyan }}><span className="jdot">▸ JARVIS processing</span><span className="jcursor">_</span></div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0 8px' }}>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => setInput(s + (s.endsWith('for') || s === 'prep' || s === 'scout' ? ' ' : ''))}
                  style={{ ...chip }}>{s}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: C.cyan, fontFamily: mono, alignSelf: 'center', fontSize: 15 }}>›</span>
              <input style={{ ...inputStyle, fontFamily: mono }} value={input} placeholder="ask JARVIS…  (status · who's next · log a call · scout …)"
                onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} disabled={thinking} />
              <button style={btn(C.green)} onClick={() => send()} disabled={thinking}>Send</button>
            </div>
          </div>

          {/* INTEL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={panel}>
              <SectionTitle>Revenue</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <Stat label="Dials yest" value={r.dials_yesterday ?? 0} />
                <Stat label="Trials" value={r.trials_live ?? 0} color={C.cyan} />
                <Stat label="Paying" value={r.paying_clients ?? 0} color={C.green} />
                <Stat label="MRR" value={`£${Math.round(r.mrr ?? 0)}`} color={C.green} />
                <Stat label="Churn" value={r.churn_risk_count ?? 0} color={(r.churn_risk_count ?? 0) > 0 ? C.red : C.text} />
              </div>
            </div>
            <div style={panel}>
              <SectionTitle>Pipeline</SectionTitle>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {['to_call', 'called', 'interested', 'demo_booked', 'won', 'not_interested', 'lost'].map(s => (
                  <Stat key={s} label={s.replace('_', ' ')} value={pipe[s] ?? 0} small
                    color={s === 'won' ? C.green : s === 'demo_booked' ? C.cyan : s === 'to_call' ? C.amber : C.text} />
                ))}
              </div>
            </div>
            <div style={panel}>
              <SectionTitle>Trials {trials.length > 0 && <Count n={trials.length} />}</SectionTitle>
              {trials.length === 0 && <Muted>No live trials.</Muted>}
              {trials.map((t, i) => (
                <Row key={i}>
                  <span>{t.business_name}</span>
                  <span style={{ color: t.churn_risk ? C.red : C.muted, fontSize: 12, fontFamily: mono }}>
                    {t.days_remaining}d · {t.leads_captured} leads {t.churn_risk ? '🔴' : ''}
                  </span>
                </Row>
              ))}
            </div>
            <div style={panel}>
              <SectionTitle>Captured leads {leads.length > 0 && <Count n={leads.length} />}</SectionTitle>
              {leads.length === 0 && <Muted>None yet — submit the capture form to test.</Muted>}
              {leads.slice(0, 8).map(l => (
                <Row key={l.id}>
                  <span style={{ fontSize: 13 }}>{l.client_name || '—'} · {l.name || ''} {l.phone}</span>
                  <span style={{ color: C.muted, fontSize: 11, fontFamily: mono }}>{l.source} · {l.status}</span>
                </Row>
              ))}
            </div>
          </div>
        </div>

        {/* ── call queue ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 16, marginTop: 16 }}>
          {['D', 'L'].map(f => (
            <div key={f} style={panel}>
              <SectionTitle>{f}’s call queue <Count n={(calls[f] || []).length} /></SectionTitle>
              {(calls[f] || []).length === 0 && <Muted>List clear.</Muted>}
              {(calls[f] || []).map(p => (
                <div key={p.id} className="jline" style={{ borderTop: `1px solid ${C.borderSoft}`, padding: '10px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 600 }}>
                      {p.priority === 0 ? '⏰ ' : ''}{p.business_name}
                      <span style={{ color: C.muted, fontWeight: 400, fontSize: 12 }}> · {[p.trade, p.town].filter(Boolean).join(', ')}</span>
                    </div>
                    <span style={{ color: C.green, fontSize: 11, fontFamily: mono }}>{p.priority === 0 ? p.reason : `#${p.rank_score}`}</span>
                  </div>
                  {p.phone && <a href={`tel:${p.phone}`} style={{ color: C.cyan, fontSize: 13, textDecoration: 'none', fontFamily: mono }}>{p.phone}</a>}
                  {p.call_notes && <div style={{ color: C.muted, fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>📝 {p.call_notes.slice(0, 200)}</div>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: 2, minWidth: 120, padding: '6px 9px' }} placeholder="call outcome…"
                      value={outcomes[p.id] || ''} onChange={e => setOutcomes(o => ({ ...o, [p.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && logCall(p.id)} />
                    <select style={{ ...inputStyle, flex: 1, minWidth: 110, padding: '6px 9px' }}
                      value={statuses[p.id] || ''} onChange={e => setStatuses(s => ({ ...s, [p.id]: e.target.value }))}>
                      <option value="">auto status</option>
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button style={btn(C.green)} onClick={() => logCall(p.id)}>Log</button>
                    <button style={btn()} onClick={() => prep(p.id)}>Prep</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* ── footer ops ── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 20, alignItems: 'center' }}>
          <button style={btn(C.green)} onClick={() => run('08:00 job', () => cron.morning(key))} disabled={!!busy}>Run 08:00 (calls + report)</button>
          <button style={btn(C.amber)} onClick={() => run('18:00 job', () => cron.evening(key))} disabled={!!busy}>Run 18:00 (follow-ups)</button>
          <button style={btn(C.cyan)} onClick={seed} disabled={!!busy}>{busy === 'Seed' ? 'Seeding…' : 'Seed demo data'}</button>
          {busy && <span style={{ color: C.muted, fontFamily: mono, fontSize: 12 }}>running {busy}…</span>}
        </div>
      </div>
    </div>
  )
}

// ── presentational helpers ──────────────────────────────────────────
const shell = { minHeight: '100vh', background: `radial-gradient(1200px 600px at 70% -10%, rgba(0,212,255,.08), transparent 60%), ${C.bg}`, position: 'relative', overflowX: 'hidden' }
const chip = { background: 'rgba(0,212,255,0.06)', border: `1px solid ${C.borderSoft}`, color: C.cyan, borderRadius: 99, padding: '4px 11px', fontSize: 11, cursor: 'pointer', fontFamily: mono }

const Scanline = () => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', overflow: 'hidden' }}>
    <div style={{ position: 'absolute', left: 0, right: 0, height: 120, background: 'linear-gradient(rgba(0,212,255,0), rgba(0,212,255,.05), rgba(0,212,255,0))', animation: 'jscan 7s linear infinite' }} />
    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,212,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,.03) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
  </div>
)

const SectionTitle = ({ children }) => (
  <div style={{ color: C.cyan, fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, fontFamily: mono }}>{children}</div>
)
const Count = ({ n }) => <span style={{ color: C.muted, fontWeight: 400 }}>· {n}</span>
const Muted = ({ children }) => <div style={{ color: C.muted, fontSize: 13 }}>{children}</div>
const Row = ({ children }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderTop: `1px solid ${C.borderSoft}`, padding: '7px 0' }}>{children}</div>

const Stat = ({ label, value, color = C.text, small }) => (
  <div style={{ minWidth: small ? 78 : 92 }}>
    <div style={{ fontSize: small ? 20 : 26, fontWeight: 800, color, fontFamily: mono }}>{value}</div>
    <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</div>
  </div>
)

const TermLine = ({ role, text }) => {
  if (role === 'you') return <div className="jline" style={{ margin: '2px 0' }}><span style={{ color: C.green }}>›</span> <span style={{ color: C.text }}>{text}</span></div>
  if (role === 'jarvis') return <div className="jline" style={{ margin: '2px 0 10px', color: C.cyan, whiteSpace: 'pre-wrap' }}><span style={{ color: C.muted }}>JARVIS:</span> {text}</div>
  if (role === 'err') return <div className="jline" style={{ margin: '2px 0', color: C.red, whiteSpace: 'pre-wrap' }}>✕ {text}</div>
  return <div className="jline" style={{ margin: '2px 0', color: C.muted, whiteSpace: 'pre-wrap' }}>· {text}</div>
}
