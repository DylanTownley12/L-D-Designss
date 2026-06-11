import { useState, useEffect, useRef, useCallback } from 'react'
import { salesOps } from '../api/client'

// ════════════════════════════════════════════════════════════════════
//  MISSION CONTROL — the single founder cockpit. Every screen answers
//  "what should D or L do in the next 15 minutes to create revenue?"
//  Standalone, zero app chrome. OPS_KEY gate. Inline styles only.
// ════════════════════════════════════════════════════════════════════
const C = {
  bg: '#0a0a0a', panel: '#101317', line: '#1d2530', lineSoft: '#161b22',
  cyan: '#00d4ff', green: '#00ff88', red: '#ff3b3b', amber: '#ffb547',
  text: '#e7eef3', dim: '#8b9aa7', faint: '#5a6b78',
}
const mono = "'JetBrains Mono','SF Mono',ui-monospace,Menlo,monospace"
const ui = "Inter,system-ui,sans-serif"
const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 14 }
const inp = { background: '#0c0f13', border: `1px solid ${C.line}`, color: C.text, borderRadius: 7, padding: '9px 11px', fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: ui }
const btn = (c = C.cyan) => ({ background: 'transparent', border: `1px solid ${c}`, color: c, borderRadius: 6, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: ui, whiteSpace: 'nowrap' })

const PREVIEW_BASE = (import.meta.env.VITE_API_URL || 'https://l-d-designss-production.up.railway.app/api').replace(/\/api\/?$/, '')

// One-tap outcomes → (label, outcome text, new_status, terminal?)
const OUTCOMES = [
  ['ANSWERED', 'answered', 'called', false],
  ['NO ANSWER', 'no answer', 'called', false],
  ['GATEKEEPER', 'gatekeeper', 'called', false],
  ['INTERESTED', 'interested', 'interested', false],
  ['DEMO BOOKED', 'demo booked', 'demo_booked', false],
  ['NOT INTERESTED', 'not interested', 'not_interested', true],
]
const OUTCOME_COLOR = { ANSWERED: C.cyan, 'NO ANSWER': C.faint, GATEKEEPER: C.amber, INTERESTED: C.green, 'DEMO BOOKED': C.green, 'NOT INTERESTED': C.red }
// 2-tap picker: WHEN to follow up → days from today
const WHENS = [['Tomorrow', 1], ['3 days', 3], ['Next week', 7]]
const CHIPS = ['what should D do now?', "who's next", 'hottest prospects', 'follow-ups due', 'brief me', 'at risk', 'summarise today']
const AGENT_LABELS = { lead_finder: 'LEAD FINDER', dial_manager: 'LEAD PRIORITISER', qualifier: 'QUALIFIER', preview_qa: 'PREVIEW QA', followup: 'FOLLOW-UP', reporter: 'REVENUE', ceo: 'CEO' }

const FX = `
@keyframes jblink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes jpulseRed{0%,100%{box-shadow:0 0 0 0 rgba(255,59,59,.0)}50%{box-shadow:0 0 0 2px rgba(255,59,59,.35)}}
@keyframes jflash{0%{background:rgba(0,255,136,.18)}100%{background:transparent}}
@keyframes jfade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.jln{animation:jfade .2s ease both}.jcur{animation:jblink 1s step-end infinite}
.jred{animation:jpulseRed 1.8s ease-in-out infinite}.jflash{animation:jflash 1.4s ease-out}
.jglow{text-shadow:0 0 10px rgba(0,212,255,.5)}
::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-thumb{background:#1d2530;border-radius:7px}
`

const isoIn = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10) }

export default function MissionControl() {
  const [key, setKey] = useState(localStorage.getItem('opsKey') || '')
  const [authed, setAuthed] = useState(false)
  const [authErr, setAuthErr] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [booting, setBooting] = useState(false)

  const [mode, setMode] = useState('real')
  const [founder, setFounder] = useState('D')
  const [board, setBoard] = useState(null)
  const [events, setEvents] = useState([])
  const [clock, setClock] = useState(new Date())
  const [pollOk, setPollOk] = useState(true)

  const [lines, setLines] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [history, setHistory] = useState([])
  const [histIdx, setHistIdx] = useState(-1)
  const [busy, setBusy] = useState('')
  const [picker, setPicker] = useState(null)   // {id, outcome, status, label}
  const [seenLeadIds, setSeenLeadIds] = useState(null)
  const [flashLeads, setFlashLeads] = useState({})

  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  const refresh = useCallback(async (k = key, m = mode) => {
    try {
      const [b, ev] = await Promise.all([
        salesOps.board(k, m),
        salesOps.agentEvents(k, 40).catch(() => ({ events: [] })),
      ])
      setBoard(b); setEvents(ev.events || []); setPollOk(true)
      const ids = (b.recent_leads || []).map(l => l.id)
      setSeenLeadIds(prev => {
        if (prev) {
          const fresh = ids.filter(id => !prev.includes(id))
          if (fresh.length) { const f = {}; fresh.forEach(id => f[id] = 1); setFlashLeads(f); setTimeout(() => setFlashLeads({}), 1500) }
        }
        return ids
      })
      return b
    } catch (e) { setPollOk(false); return null }
  }, [key, mode])

  const unlock = async (k) => {
    setAuthBusy(true); setAuthErr('')
    try {
      const b = await salesOps.board(k, 'real')
      setBoard(b); localStorage.setItem('opsKey', k)
      setBooting(true); setAuthed(true)
      setTimeout(() => setBooting(false), 1500)
      setLines([{ role: 'sys', text: 'Mission Control online. What moves revenue in the next 15 minutes?' }])
      refresh(k, 'real')
    } catch (e) {
      const m = e.message || ''
      setAuthErr(/network/i.test(m) || !m
        ? 'Reached the server but the API failed — backend restarting, or the Supabase migration isn’t run yet. Wait ~20s and retry.'
        : m)
    } finally { setAuthBusy(false) }
  }

  useEffect(() => { if (key) unlock(key) }, [])                        // eslint-disable-line
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!authed) return; const t = setInterval(() => refresh(), 15000); return () => clearInterval(t) }, [authed, refresh])
  useEffect(() => { if (authed) refresh(key, mode) }, [mode])         // eslint-disable-line
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [lines, thinking])

  const push = (role, text) => setLines(l => [...l, { role, text }])

  const send = async (raw) => {
    const text = (raw ?? input).trim()
    if (!text || thinking) return
    setInput(''); setHistory(h => [text, ...h].slice(0, 50)); setHistIdx(-1)
    push('you', text); setThinking(true)
    try { const r = await salesOps.command(key, text, founder); push('jarvis', r.reply || '…'); refresh() }
    catch (e) { push('err', e.message || 'Command failed') }
    finally { setThinking(false) }
  }
  const onKey = (e) => {
    if (e.key === 'Enter') return send()
    if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); const i = Math.min(histIdx + 1, history.length - 1); setHistIdx(i); setInput(history[i]) }
    if (e.key === 'ArrowDown' && histIdx >= 0) { e.preventDefault(); const i = histIdx - 1; setHistIdx(i); setInput(i < 0 ? '' : history[i]) }
  }

  // Outcome → terminal logs straight away; non-terminal opens the 2-tap WHEN picker.
  const tapOutcome = (p, o) => {
    const [label, outcome, status, terminal] = o
    if (terminal) return saveLog(p.id, outcome, status, null, null)
    setPicker({ id: p.id, outcome, status, label })
  }
  const saveLog = async (id, outcome, status, whenDays, whenLabel) => {
    setPicker(null)
    if (!id) return
    try {
      await salesOps.log(key, id, {
        outcome, new_status: status,
        next_action: whenLabel ? `${outcome} → follow up` : undefined,
        next_action_date: whenDays != null ? isoIn(whenDays) : undefined,
        reason: outcome,
      })
      refresh()
    } catch (e) { push('err', 'Log failed: ' + e.message) }
  }

  const act = async (label, fn) => {
    setBusy(label)
    try { const r = await fn(); if (r?.message) push('sys', r.message); refresh() }
    catch (e) { push('err', `${label} failed: ${e.message}`) } finally { setBusy('') }
  }
  const seed = () => act('Seed', async () => {
    const r = await salesOps.seedDemo(key); const d = r.demo_client || {}
    if (d.capture_url) push('sys', `Demo capture link: ${d.capture_url}`)
    setMode('demo')
    return { message: `Seeded ${r.prospects?.queue_ready ?? 0} queue-ready prospects (demo).` }
  })
  const taskDone = async (id) => { try { await salesOps.taskDone(key, id); refresh() } catch (e) { push('err', e.message) } }
  const runAgent = (a) => act(AGENT_LABELS[a] || a, () => salesOps.runAgent(key, a, mode))
  const setWebsite = (id, ws) => act('Qualify', () => salesOps.setWebsiteStatus(key, id, { website_status: ws }))
  const buildPreview = (id) => act('Preview', () => salesOps.buildPreview(key, id))
  const approve = (id) => act('Approve', () => salesOps.approvePreview(key, id))
  const resolveAlert = (id) => act('Resolve', () => salesOps.resolveAlert(key, id))

  // ════════════════════════════════════════════════════════════════
  if (!authed) return (
    <div style={shell}>
      <style>{FX}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ui }}>
        <div style={{ ...card, width: 380, textAlign: 'center', padding: 26 }}>
          <div className="jglow" style={{ color: C.cyan, fontFamily: mono, fontSize: 24, fontWeight: 800, letterSpacing: 3 }}>MISSION CONTROL</div>
          <div style={{ color: C.faint, fontSize: 11, letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' }}>Founders only</div>
          <input style={{ ...inp, fontFamily: mono, textAlign: 'center', letterSpacing: 2, marginTop: 22 }} type="password"
            value={key} placeholder="ops key" autoFocus
            onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && unlock(key)} />
          {authErr && <div style={{ color: C.red, fontSize: 12, marginTop: 10, lineHeight: 1.5 }}>{authErr}</div>}
          <button style={{ ...btn(), marginTop: 16, width: '100%', padding: 11, fontSize: 13 }} onClick={() => unlock(key)} disabled={authBusy}>
            {authBusy ? 'Authenticating…' : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  )

  const r = board?.report || {}
  const pipe = board?.pipeline || {}
  const calls = board?.calls || { D: [], L: [] }
  const tasks = board?.tasks || []
  const trials = r.trial_details || []
  const leads = board?.recent_leads || []
  const alerts = board?.alerts || []
  const needs = board?.needs_data || []
  const atRisk = board?.at_risk || []
  const overdue = board?.overdue || []
  const health = board?.agent_health || []
  const briefing = board?.briefing || {}
  const bottleneck = board?.bottleneck || {}
  const setupNeeded = !!board?.setup_needed
  const demo = mode === 'demo'
  const nextCall = (calls[founder] || [])[0]

  return (
    <div style={{ ...shell, border: demo ? `2px solid ${C.amber}` : 'none' }}>
      <style>{FX}</style>
      {booting && <Boot onSkip={() => setBooting(false)} />}
      <div style={{ padding: '12px 16px 48px', fontFamily: ui, color: C.text, maxWidth: 1500, margin: '0 auto' }}>

        {/* TOP BAR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, paddingBottom: 12, borderBottom: `1px solid ${C.line}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="jglow" style={{ color: C.cyan, fontFamily: mono, fontWeight: 800, fontSize: 17, letterSpacing: 2 }}>MISSION CONTROL</span>
            <Dot ok={pollOk} /><span style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>{clock.toLocaleTimeString('en-GB')} · London</span>
            <div style={{ display: 'flex', border: `1px solid ${demo ? C.amber : C.line}`, borderRadius: 7, overflow: 'hidden' }}>
              {['real', 'demo'].map(m => <button key={m} onClick={() => setMode(m)} style={{ background: mode === m ? (m === 'demo' ? C.amber : C.green) : 'transparent', color: mode === m ? '#000' : C.dim, border: 'none', padding: '5px 12px', fontWeight: 800, cursor: 'pointer', fontFamily: mono, fontSize: 11, textTransform: 'uppercase' }}>{m}</button>)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
            <Metric label="Builds £" value={`£${Math.round(r.build_revenue ?? 0)}`} big color={C.green} />
            <Metric label="MRR" value={`£${Math.round(r.mrr ?? 0)}`} color={C.green} />
            <Metric label="Queued" value={pipe.to_call ?? 0} color={C.cyan} />
            <Metric label="Won" value={pipe.won ?? 0} color={C.amber} />
            <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 7, overflow: 'hidden' }}>
              {['D', 'L'].map(f => <button key={f} onClick={() => setFounder(f)} style={{ background: founder === f ? C.cyan : 'transparent', color: founder === f ? '#000' : C.dim, border: 'none', padding: '6px 13px', fontWeight: 800, cursor: 'pointer', fontFamily: mono }}>{f}</button>)}
            </div>
            <button style={btn()} onClick={() => refresh()}>↻</button>
          </div>
        </div>

        {setupNeeded && (
          <Banner color={C.red} title="DATABASE NOT INITIALISED">
            Your key works, but the trades tables aren’t there yet. Paste <b>backend/db/PASTE_INTO_SUPABASE.sql</b> into
            Supabase → SQL Editor → Run, then hit ↻.
          </Banner>
        )}
        {demo && <div style={{ ...card, borderColor: C.amber, marginBottom: 12, color: C.amber, fontFamily: mono, fontSize: 12, fontWeight: 700 }}>⚠ DEMO DATA — this is practice. Switch to REAL before calling.</div>}

        {/* (2) RED ALERT banner — never collapses while active */}
        {alerts.length > 0 && (
          <div className="jred" style={{ ...card, borderColor: C.red, marginBottom: 14 }}>
            <div style={{ color: C.red, fontFamily: mono, fontWeight: 800, fontSize: 13, marginBottom: 6 }}>⚠ {alerts.length} RED ALERT{alerts.length > 1 ? 'S' : ''}</div>
            {alerts.slice(0, 6).map(a => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', fontSize: 13, borderTop: `1px solid ${C.lineSoft}` }}>
                <span><span style={{ color: a.severity === 'error' ? C.red : C.amber, fontFamily: mono, fontSize: 11 }}>[{a.kind}]</span> {a.message}</span>
                <button style={btn(C.faint)} onClick={() => resolveAlert(a.id)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* (1) NEXT CALL strip — top, huge */}
        <div style={{ ...card, marginBottom: 14, borderLeft: `4px solid ${C.cyan}`, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: 2, color: C.faint, textTransform: 'uppercase' }}>▶ NEXT CALL · {founder}</span>
            {nextCall && <span style={{ fontFamily: mono, fontSize: 12, color: nextCall.priority === 0 ? C.red : C.green }}>{nextCall.priority === 0 ? 'OVERDUE' : `SCORE ${nextCall.score ?? 0}`}</span>}
          </div>
          {!nextCall && <div style={{ color: C.faint, fontFamily: mono, fontSize: 14 }}>{setupNeeded ? 'Run the migration, then seed.' : `Queue clear for ${founder} — import + qualify prospects, or seed demo.`}</div>}
          {nextCall && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 26, fontWeight: 800 }}>{nextCall.business_name}</span>
                <span style={{ color: C.dim, fontSize: 14 }}>{[nextCall.trade, nextCall.town].filter(Boolean).join(' · ')}</span>
                {nextCall.phone && <a href={`tel:${nextCall.phone}`} style={{ color: C.cyan, fontSize: 20, fontFamily: mono, textDecoration: 'none', fontWeight: 700 }}>📞 {nextCall.phone}</a>}
              </div>
              <div style={{ color: C.green, fontSize: 15, marginTop: 6, fontWeight: 600 }}>🎯 {nextCall.sales_angle}</div>
              {nextCall.call_notes && <div style={{ color: C.dim, fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>📝 {nextCall.call_notes.slice(0, 200)}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <PreviewChip p={nextCall} onBuild={() => buildPreview(nextCall.id)} onApprove={() => approve(nextCall.id)} busy={busy} />
              </div>
              <OutcomeRow p={nextCall} big picker={picker} onOutcome={tapOutcome} onWhen={saveLog} onCancel={() => setPicker(null)} />
            </>
          )}
        </div>

        {/* MAIN GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1.1fr) minmax(330px,1.1fr) minmax(280px,1fr)', gap: 14, alignItems: 'start' }}>

          {/* LEFT — queues */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['D', 'L'].map(f => (
              <Section key={f} title={`${f}'S QUEUE`} count={(calls[f] || []).length}>
                {(calls[f] || []).length === 0 && <Empty>AWAITING QUEUE-READY PROSPECTS.</Empty>}
                {(calls[f] || []).slice(0, 50).map(p => (
                  <div key={p.id} className={p.priority === 0 ? 'jln jred' : 'jln'} style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '9px 0', borderRadius: p.priority === 0 ? 6 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>{p.priority === 0 ? '⏰ ' : ''}{p.business_name}
                        <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}> · {[p.trade, p.town].filter(Boolean).join(', ')}</span></span>
                      <span style={{ color: p.priority === 0 ? C.red : C.green, fontSize: 11, fontFamily: mono, whiteSpace: 'nowrap' }}>{p.priority === 0 ? 'OVERDUE' : p.score ?? 0}</span>
                    </div>
                    {p.phone && <a href={`tel:${p.phone}`} style={{ color: C.cyan, fontSize: 14, textDecoration: 'none', fontFamily: mono }}>📞 {p.phone}</a>}
                    <div style={{ color: C.green, fontSize: 12, marginTop: 3 }}>🎯 {p.sales_angle}</div>
                    <OutcomeRow p={p} picker={picker} onOutcome={tapOutcome} onWhen={saveLog} onCancel={() => setPicker(null)} />
                  </div>
                ))}
              </Section>
            ))}

            {/* (4) Follow-ups due */}
            <Section title="FOLLOW-UPS DUE" count={overdue.length}>
              {overdue.length === 0 && <Empty>✓ None due.</Empty>}
              {overdue.slice(0, 12).map(a => (
                <Row key={a.id}><span style={{ fontSize: 13 }}>{a.action} <span style={{ color: C.faint }}>· due {a.due_date}</span></span></Row>
              ))}
            </Section>

            {/* (5) AT RISK */}
            <Section title="AT RISK" count={atRisk.length}>
              {atRisk.length === 0 && <Empty>✓ Nothing rotting.</Empty>}
              {atRisk.slice(0, 12).map(p => (
                <Row key={p.id}><span style={{ fontSize: 13 }}>{p.business_name} <span style={{ color: C.faint }}>[{p.assigned_to}]</span></span>
                  <span style={{ color: C.amber, fontFamily: mono, fontSize: 11 }}>{(p.last_called_at || '').slice(0, 10) || 'never'}</span></Row>
              ))}
            </Section>
          </div>

          {/* CENTRE — console + briefing + feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 360 }}>
              <Head>COMMAND CONSOLE {lines.some(l => /raw mode/i.test(l.text)) && <span style={{ color: C.amber }}>· AI OFFLINE</span>}</Head>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', fontFamily: mono, fontSize: 13, lineHeight: 1.5, padding: '2px 0' }}>
                {lines.length === 0 && <div style={{ color: C.faint }}>Ask anything — “what should {founder} do now?”, “build preview for …”, “import …”.</div>}
                {lines.map((l, i) => <Term key={i} {...l} />)}
                {thinking && <div className="jln" style={{ color: C.cyan }}>▸ processing<span className="jcur">_</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '9px 0 7px' }}>
                {CHIPS.map(c => <button key={c} onClick={() => send(c)} style={chip}>{c}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <span style={{ color: C.cyan, alignSelf: 'center', fontFamily: mono }}>›</span>
                <input ref={inputRef} style={{ ...inp, fontFamily: mono }} value={input} placeholder="message Mission Control…"
                  onChange={e => setInput(e.target.value)} onKeyDown={onKey} disabled={thinking} />
                <button style={btn(C.green)} onClick={() => send()} disabled={thinking}>Send</button>
              </div>
            </div>

            {/* (6) CEO briefing */}
            <Section title="CEO BRIEFING">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: C.faint, fontFamily: mono, fontSize: 11 }}>{bottleneck.stage ? `BOTTLENECK: ${bottleneck.stage}` : 'no bottleneck yet'}</span>
                <button style={btn(C.cyan)} disabled={!!busy} onClick={() => act('Brief', () => salesOps.brief(key, mode))}>{busy === 'Brief' ? '…' : 'BRIEF ME'}</button>
              </div>
              {briefing.text
                ? <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.5, color: C.text, maxHeight: 260, overflowY: 'auto' }}>{briefing.text}</div>
                : <Empty>No briefing yet — hit BRIEF ME.</Empty>}
            </Section>

            <Section title="AGENT OPS FEED" count={events.length}>
              <div style={{ maxHeight: 160, overflowY: 'auto', fontFamily: mono, fontSize: 12 }}>
                {events.length === 0 && <Empty>AWAITING ACTIVITY.</Empty>}
                {events.map(e => (
                  <div key={e.id} className="jln" style={{ padding: '3px 0', color: e.level === 'error' ? C.red : e.level === 'warn' ? C.amber : C.dim }}>
                    <span style={{ color: C.faint }}>[{(e.created_at || '').slice(11, 19)}]</span>{' '}
                    <span style={{ color: C.cyan }}>{(e.agent || '').toUpperCase()}</span> {e.message}
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* RIGHT — needs data, agent health, panels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* NEEDS DATA bucket */}
            <Section title="NEEDS DATA" count={needs.length}>
              {needs.length === 0 && <Empty>✓ Every prospect qualified.</Empty>}
              {needs.slice(0, 10).map(p => (
                <div key={p.id} style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '8px 0' }}>
                  <div style={{ fontSize: 13 }}>{p.business_name} <span style={{ color: C.faint }}>· {[p.trade, p.town].filter(Boolean).join(', ')}</span></div>
                  <div style={{ color: C.amber, fontSize: 11, fontFamily: mono, margin: '2px 0 5px' }}>{p.needs_data_reason || 'needs website status'}</div>
                  {(p.website_status || 'unknown') === 'unknown' &&
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button style={btn(C.green)} disabled={!!busy} onClick={() => setWebsite(p.id, 'none')}>No website</button>
                      <button style={btn(C.cyan)} disabled={!!busy} onClick={() => setWebsite(p.id, 'has_website')}>Has website</button>
                    </div>}
                </div>
              ))}
            </Section>

            {/* (7) Agent health */}
            <Section title="AGENT HEALTH">
              {health.map(a => (
                <div key={a.agent} style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '7px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: mono, fontSize: 12 }}>
                      <span style={{ color: a.ok == null ? C.faint : a.ok ? C.green : C.red }}>●</span> {a.label}
                    </span>
                    <button style={btn()} disabled={!!busy} onClick={() => runAgent(a.agent)}>{busy === (AGENT_LABELS[a.agent] || a.agent) ? '…' : 'RUN'}</button>
                  </div>
                  <div style={{ color: C.faint, fontSize: 10, marginTop: 2 }}>{a.last_run ? `${(a.last_run || '').slice(11, 16)} · ${a.metric || (a.message || '').slice(0, 38)}` : 'no runs yet'}</div>
                </div>
              ))}
            </Section>

            <Section title="TASKS" count={tasks.length}>
              {tasks.length === 0 && <Empty>No open tasks.</Empty>}
              {tasks.map(t => (
                <Row key={t.id}><span style={{ fontSize: 13 }}><span style={{ color: C.faint }}>{t.owner || '·'}</span> {t.title}</span>
                  <button style={btn(C.green)} onClick={() => taskDone(t.id)}>✓</button></Row>
              ))}
            </Section>

            <Section title="TRIALS" count={trials.length}>
              {trials.length === 0 && <Empty>No live trials.</Empty>}
              {trials.map((t, i) => (
                <Row key={i}><span style={{ fontSize: 13 }}>{t.business_name}</span>
                  <span className={t.churn_risk ? 'jred' : ''} style={{ color: t.churn_risk ? C.red : C.dim, fontSize: 12, fontFamily: mono }}>{t.days_remaining}d · {t.leads_captured} leads{t.churn_risk ? ' ⚠' : ''}</span></Row>
              ))}
            </Section>

            <Section title="CAPTURED LEADS" count={leads.length}>
              {leads.length === 0 && <Empty>Submit the capture form to test.</Empty>}
              {leads.slice(0, 6).map(l => (
                <div key={l.id} className={flashLeads[l.id] ? 'jflash' : ''} style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.lineSoft}`, padding: '6px 0', fontSize: 12 }}>
                  <span>{l.name || '—'} {l.phone}{l.photo_urls?.length ? ' 📷' : ''}<div style={{ color: C.faint }}>{l.client_name} · {l.job_type || l.source}</div></span>
                  <span style={{ color: C.dim, fontFamily: mono }}>{l.status}</span>
                </div>
              ))}
            </Section>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, alignItems: 'center' }}>
          <button style={btn(C.cyan)} onClick={seed} disabled={!!busy}>Seed demo</button>
          <button style={btn(C.red)} onClick={() => { if (confirm('Delete ALL demo rows (data_mode=demo)? Real data untouched.')) act('Wipe', () => salesOps.wipeSeed(key)) }} disabled={!!busy}>Wipe demo</button>
          <button style={btn(C.green)} onClick={() => act('Requalify', () => salesOps.requalify(key, mode))} disabled={!!busy}>Requalify</button>
          <a href="/leads" style={{ ...btn(C.faint), textDecoration: 'none' }}>Barber dashboard →</a>
          {busy && <span style={{ color: C.dim, fontFamily: mono, fontSize: 12 }}>{busy}…</span>}
        </div>
      </div>
    </div>
  )
}

// ── bits ─────────────────────────────────────────────────────────────
const shell = { minHeight: '100vh', background: C.bg, position: 'relative', boxSizing: 'border-box' }
const chip = { background: '#0c0f13', border: `1px solid ${C.line}`, color: C.cyan, borderRadius: 99, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: mono }

const OutcomeRow = ({ p, big, picker, onOutcome, onWhen, onCancel }) => {
  const open = picker && picker.id === p.id
  if (open) return (
    <div className="jln" style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span style={{ color: C.amber, fontFamily: mono, fontSize: 11 }}>{picker.label} → follow up when?</span>
      {WHENS.map(([lbl, d]) => <button key={lbl} style={btn(C.amber)} onClick={() => onWhen(p.id, picker.outcome, picker.status, d, lbl)}>{lbl}</button>)}
      <button style={btn(C.faint)} onClick={onCancel}>cancel</button>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
      {OUTCOMES.map(o => (
        <button key={o[0]} style={{ ...btn(OUTCOME_COLOR[o[0]]), padding: big ? '6px 11px' : '4px 8px', fontSize: big ? 11 : 10 }}
          onClick={() => onOutcome(p, o)}>{o[0]}</button>
      ))}
    </div>
  )
}

const PreviewChip = ({ p, onBuild, onApprove, busy }) => {
  const s = p.preview_status
  if (!s || s === 'none') return <button style={btn(C.cyan)} disabled={!!busy} onClick={onBuild}>{busy === 'Preview' ? 'Building…' : '🖥 Build preview'}</button>
  if (s === 'qa_failed') return <span style={{ color: C.red, fontFamily: mono, fontSize: 12 }}>⚠ preview QA failed <button style={{ ...btn(C.cyan), marginLeft: 6 }} onClick={onBuild}>rebuild</button></span>
  if (s === 'draft') return <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><a href={`${PREVIEW_BASE}/previews/serve/${p.preview_id}`} target="_blank" rel="noreferrer" style={{ color: C.cyan, fontFamily: mono, fontSize: 12 }}>view preview</a><button style={btn(C.green)} disabled={!!busy} onClick={onApprove}>Approve → READY</button></span>
  if (s === 'ready') return <a href={`${PREVIEW_BASE}/previews/serve/${p.preview_id}`} target="_blank" rel="noreferrer" style={{ color: C.green, fontFamily: mono, fontSize: 12, fontWeight: 700 }}>✓ preview READY — open</a>
  return null
}

const Boot = ({ onSkip }) => (
  <div onClick={onSkip} style={{ position: 'fixed', inset: 0, zIndex: 50, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: mono, cursor: 'pointer' }}>
    <div className="jglow" style={{ color: C.cyan, fontSize: 30, fontWeight: 800, letterSpacing: 5 }}>MISSION CONTROL</div>
    <div style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>initialising revenue operations<span className="jcur">_</span></div>
    <div style={{ color: C.faint, fontSize: 10, marginTop: 20 }}>click to skip</div>
  </div>
)
const Dot = ({ ok }) => <span style={{ width: 8, height: 8, borderRadius: 99, background: ok ? C.green : C.red, boxShadow: `0 0 7px ${ok ? C.green : C.red}`, display: 'inline-block' }} />
const Metric = ({ label, value, color = C.text, big }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: mono, fontWeight: 800, color, fontSize: big ? 24 : 18, lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{label}</div>
  </div>
)
const Head = ({ children }) => <div style={{ color: C.dim, fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontFamily: mono, display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 5, height: 5, background: C.cyan, borderRadius: 99 }} />{children}</div>
const Section = ({ title, count, children }) => <div style={card}><Head>{title}{count != null && <span style={{ color: C.faint }}>· {count}</span>}</Head>{children}</div>
const Row = ({ children }) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', borderTop: `1px solid ${C.lineSoft}`, padding: '6px 0' }}>{children}</div>
const Empty = ({ children }) => <div style={{ color: C.faint, fontSize: 12, fontFamily: mono }}>{children}</div>
const Banner = ({ color, title, children }) => <div style={{ ...card, borderColor: color, marginBottom: 14 }}><div style={{ color, fontFamily: mono, fontWeight: 700, fontSize: 13 }}>⚠ {title}</div><div style={{ fontSize: 13, marginTop: 6, lineHeight: 1.55, color: C.text }}>{children}</div></div>
const Term = ({ role, text }) => {
  if (role === 'you') return <div className="jln" style={{ margin: '2px 0' }}><span style={{ color: C.green }}>›</span> {text}</div>
  if (role === 'jarvis') return <div className="jln" style={{ margin: '2px 0 9px', color: C.cyan, whiteSpace: 'pre-wrap' }}><span style={{ color: C.faint }}>MC:</span> {text}</div>
  if (role === 'err') return <div className="jln" style={{ margin: '2px 0', color: C.red, whiteSpace: 'pre-wrap' }}>✕ {text}</div>
  return <div className="jln" style={{ margin: '2px 0', color: C.faint, whiteSpace: 'pre-wrap' }}>· {text}</div>
}
