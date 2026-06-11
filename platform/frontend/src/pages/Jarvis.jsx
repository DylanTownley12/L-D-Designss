import { useState, useEffect, useRef, useCallback } from 'react'
import { salesOps, cron } from '../api/client'

// ════════════════════════════════════════════════════════════════════
//  J.A.R.V.I.S — the single founder cockpit for the trades business.
//  Standalone, zero app chrome. OPS_KEY gate (remembered per device).
//  Inline styles only. No Tailwind, no deps. Dark, fast, readable.
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

// One-tap call outcomes → (label, outcome text, new_status)
const OUTCOMES = [
  ['ANSWERED', 'answered', 'called'],
  ['NO ANSWER', 'no answer', 'called'],
  ['GATEKEEPER', 'gatekeeper', 'called'],
  ['INTERESTED', 'interested', 'interested'],
  ['DEMO BOOKED', 'demo booked', 'demo_booked'],
  ['NOT INTERESTED', 'not interested', 'not_interested'],
]
const OUTCOME_COLOR = { ANSWERED: C.cyan, 'NO ANSWER': C.faint, GATEKEEPER: C.amber, INTERESTED: C.green, 'DEMO BOOKED': C.green, 'NOT INTERESTED': C.red }
const CHIPS = ['status', "who's next", 'today', 'hottest prospects', 'follow-ups due', "what should D do now?", 'summarise today']
const AGENTS = [
  ['dial_manager', 'LEAD PRIORITISER'], ['followup', 'FOLLOW-UP'], ['reporter', 'REVENUE ANALYST'],
]

const FX = `
@keyframes jblink{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes jpulseRed{0%,100%{box-shadow:0 0 0 0 rgba(255,59,59,.0)}50%{box-shadow:0 0 0 2px rgba(255,59,59,.35)}}
@keyframes jflash{0%{background:rgba(0,255,136,.18)}100%{background:transparent}}
@keyframes jfade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.jln{animation:jfade .2s ease both}
.jcur{animation:jblink 1s step-end infinite}
.jred{animation:jpulseRed 1.8s ease-in-out infinite}
.jflash{animation:jflash 1.4s ease-out}
.jglow{text-shadow:0 0 10px rgba(0,212,255,.5)}
::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-thumb{background:#1d2530;border-radius:7px}
`

export default function Jarvis() {
  const [key, setKey] = useState(localStorage.getItem('opsKey') || '')
  const [authed, setAuthed] = useState(false)
  const [authErr, setAuthErr] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [booting, setBooting] = useState(false)

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
  const [seenLeadIds, setSeenLeadIds] = useState(null)
  const [flashLeads, setFlashLeads] = useState({})

  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // ── data ───────────────────────────────────────────────────────────
  const refresh = useCallback(async (k = key) => {
    try {
      const [b, ev] = await Promise.all([
        salesOps.board(k),
        salesOps.agentEvents(k, 40).catch(() => ({ events: [] })),
      ])
      setBoard(b); setEvents(ev.events || []); setPollOk(true)
      // green-flash newly arrived captured leads
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
  }, [key])

  const unlock = async (k) => {
    setAuthBusy(true); setAuthErr('')
    try {
      const b = await salesOps.board(k)
      setBoard(b); localStorage.setItem('opsKey', k)
      setBooting(true); setAuthed(true)
      setTimeout(() => setBooting(false), 1700)
      setLines([{ role: 'sys', text: 'JARVIS online. Trades operations core ready.' }])
      refresh(k)
    } catch (e) {
      const m = e.message || ''
      setAuthErr(/network/i.test(m) || !m
        ? 'Reached JARVIS but the API failed — backend restarting, or the Supabase migration isn’t run yet. Wait ~20s and retry.'
        : m)
    } finally { setAuthBusy(false) }
  }

  useEffect(() => { if (key) unlock(key) }, [])                       // eslint-disable-line
  useEffect(() => { const t = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (!authed) return; const t = setInterval(() => refresh(), 15000); return () => clearInterval(t) }, [authed, refresh])
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [lines, thinking])

  const push = (role, text) => setLines(l => [...l, { role, text }])

  // ── console ──────────────────────────────────────────────────────
  const send = async (raw) => {
    const text = (raw ?? input).trim()
    if (!text || thinking) return
    setInput(''); setHistory(h => [text, ...h].slice(0, 50)); setHistIdx(-1)
    push('you', text); setThinking(true)
    try {
      const r = await salesOps.command(key, text, founder)
      push('jarvis', r.reply || '…'); refresh()
    } catch (e) { push('err', e.message || 'Command failed') }
    finally { setThinking(false) }
  }
  const onKey = (e) => {
    if (e.key === 'Enter') return send()
    if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); const i = Math.min(histIdx + 1, history.length - 1); setHistIdx(i); setInput(history[i]) }
    if (e.key === 'ArrowDown' && histIdx >= 0) { e.preventDefault(); const i = histIdx - 1; setHistIdx(i); setInput(i < 0 ? '' : history[i]) }
  }
  const tapProspect = (name) => { setInput(`log ${name}, `); inputRef.current?.focus() }

  // ── writes ───────────────────────────────────────────────────────
  const logOutcome = async (id, outcome, status) => {
    try { await salesOps.log(key, id, { outcome, new_status: status }); refresh() }
    catch (e) { push('err', 'Log failed: ' + e.message) }
  }
  const taskDone = async (id) => { try { await salesOps.taskDone(key, id); refresh() } catch (e) { push('err', e.message) } }

  const run = async (label, fn) => {
    setBusy(label)
    try { const r = await fn(); push('sys', typeof r === 'string' ? r : (r?.message || `${label} done.`)); refresh() }
    catch (e) { push('err', `${label} failed: ${e.message}`) } finally { setBusy('') }
  }
  const seed = () => run('Seed', async () => {
    const r = await salesOps.seedDemo(key); const d = r.demo_client || {}
    push('sys', `Seeded ${r.prospects?.added ?? 0} prospects + ${r.enrichment?.captured_leads ?? 0} leads.`)
    if (d.capture_url) push('sys', `Demo capture link: ${d.capture_url}`)
    return 'Demo data ready.'
  })
  const runAgent = (a, label) => run(label, async () => { const r = await salesOps.runAgent(key, a); return r.message || `${label} ran.` })

  // ════════════════════════════════════════════════════════════════
  if (!authed) return (
    <div style={shell}>
      <style>{FX}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: ui }}>
        <div style={{ ...card, width: 380, textAlign: 'center', padding: 26 }}>
          <div className="jglow" style={{ color: C.cyan, fontFamily: mono, fontSize: 30, fontWeight: 800, letterSpacing: 6 }}>JARVIS</div>
          <div style={{ color: C.faint, fontSize: 11, letterSpacing: 2, marginTop: 4, textTransform: 'uppercase' }}>Trades Operations · Founders only</div>
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
  const setupNeeded = !!board?.setup_needed
  const hotProspects = [...(calls.D || []), ...(calls.L || [])].filter(p => ['interested', 'demo_booked'].includes(p.status)).slice(0, 6)
  const lastByAgent = {}; events.forEach(e => { if (!lastByAgent[e.agent]) lastByAgent[e.agent] = e })

  const whatNow = (f) => {
    const list = calls[f] || []
    if (setupNeeded) return 'Run the migration, then seed.'
    if (!list.length) return 'Queue clear — import prospects (scout) or seed demo.'
    const top = list[0]
    return `${top.priority === 0 ? '⏰ ' : ''}Ring ${top.business_name}${top.phone ? ' · ' + top.phone : ''}`
  }

  return (
    <div style={shell}>
      <style>{FX}</style>
      {booting && <Boot onSkip={() => setBooting(false)} />}
      <div style={{ padding: '12px 16px 48px', fontFamily: ui, color: C.text, maxWidth: 1500, margin: '0 auto' }}>

        {/* TOP BAR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, paddingBottom: 12, borderBottom: `1px solid ${C.line}`, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span className="jglow" style={{ color: C.cyan, fontFamily: mono, fontWeight: 800, fontSize: 20, letterSpacing: 3 }}>JARVIS</span>
            <Dot ok={pollOk} /><span style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>{clock.toLocaleTimeString('en-GB')} · London</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap' }}>
            <Metric label="MRR" value={`£${Math.round(r.mrr ?? 0)}`} big color={C.green} />
            <Metric label="Trials" value={r.trials_live ?? 0} color={C.cyan} />
            <Metric label="Paying" value={r.paying_clients ?? 0} color={C.green} />
            <Metric label="To-call" value={pipe.to_call ?? 0} color={C.amber} />
            <div style={{ display: 'flex', border: `1px solid ${C.line}`, borderRadius: 7, overflow: 'hidden' }}>
              {['D', 'L'].map(f => <button key={f} onClick={() => setFounder(f)} style={{ background: founder === f ? C.cyan : 'transparent', color: founder === f ? '#000' : C.dim, border: 'none', padding: '6px 13px', fontWeight: 800, cursor: 'pointer', fontFamily: mono }}>{f}</button>)}
            </div>
            <button style={btn()} onClick={() => refresh()}>↻</button>
          </div>
        </div>

        {setupNeeded && (
          <Banner color={C.red} title="DATABASE NOT INITIALISED">
            Your key works, but the trades tables don’t exist yet. Paste <b>backend/db/PASTE_INTO_SUPABASE.sql</b> into
            Supabase → SQL Editor → Run, then hit ↻. Until then every panel is empty.
          </Banner>
        )}
        {!setupNeeded && !((calls.D || []).length || (calls.L || []).length) && (
          <Banner color={C.amber} title="NO PROSPECTS">
            Tables are live but empty. <button style={{ ...btn(C.amber), marginLeft: 6 }} onClick={seed} disabled={busy === 'Seed'}>{busy === 'Seed' ? 'Seeding…' : 'Seed demo data'}</button>
            &nbsp;or paste a real list into the console: <code style={{ color: C.cyan }}>scout wigan plumber</code> then the rows.
          </Banner>
        )}

        {/* WHAT NOW strip */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          {['D', 'L'].map(f => (
            <div key={f} style={{ ...card, flex: 1, minWidth: 280, borderLeft: `3px solid ${C.cyan}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: mono, fontWeight: 800, color: C.cyan, fontSize: 18 }}>{f}</span>
              <div><div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: 'uppercase' }}>What now</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{whatNow(f)}</div></div>
            </div>
          ))}
        </div>

        {/* MAIN GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px,1fr) minmax(340px,1.15fr) minmax(280px,1fr)', gap: 14, alignItems: 'start' }}>

          {/* LEFT — missions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {['D', 'L'].map(f => (
              <Section key={f} title={`${f}'S MISSION`} count={(calls[f] || []).length}>
                {(calls[f] || []).length === 0 && <Empty>AWAITING PROSPECTS — seed or scout a list.</Empty>}
                {(calls[f] || []).map(p => (
                  <div key={p.id} className={p.priority === 0 ? 'jln jred' : 'jln'} style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '9px 0', borderRadius: p.priority === 0 ? 6 : 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span onClick={() => tapProspect(p.business_name)} style={{ fontWeight: 600, cursor: 'pointer' }} title="tap to log">
                        {p.priority === 0 ? '⏰ ' : ''}{p.business_name}
                        <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}> · {[p.trade, p.town].filter(Boolean).join(', ')}</span>
                      </span>
                      <span style={{ color: p.priority === 0 ? C.red : C.green, fontSize: 11, fontFamily: mono, whiteSpace: 'nowrap' }}>{p.priority === 0 ? 'OVERDUE' : `#${p.rank_score}`}</span>
                    </div>
                    {p.phone && <a href={`tel:${p.phone}`} style={{ color: C.cyan, fontSize: 14, textDecoration: 'none', fontFamily: mono }}>📞 {p.phone}</a>}
                    {p.call_notes && <div style={{ color: C.dim, fontSize: 12, marginTop: 3, whiteSpace: 'pre-wrap' }}>{p.call_notes.slice(0, 160)}</div>}
                    <div style={{ display: 'flex', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
                      {OUTCOMES.map(([label, outcome, status]) => (
                        <button key={label} style={{ ...btn(OUTCOME_COLOR[label]), padding: '4px 8px', fontSize: 10 }}
                          onClick={() => logOutcome(p.id, outcome, status)}>{label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </Section>
            ))}
          </div>

          {/* CENTRE — console + agent feed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ ...card, display: 'flex', flexDirection: 'column', height: 420 }}>
              <Head>COMMAND CONSOLE {lines.some(l => /raw mode/i.test(l.text)) && <span style={{ color: C.amber }}>· AI OFFLINE — RAW MODE</span>}</Head>
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', fontFamily: mono, fontSize: 13, lineHeight: 1.5, padding: '2px 0' }}>
                {lines.length === 0 && <div style={{ color: C.faint }}>Ask anything — “what should {founder} do now?”, “who’s next?”, “log called …”.</div>}
                {lines.map((l, i) => <Term key={i} {...l} />)}
                {thinking && <div className="jln" style={{ color: C.cyan }}>▸ processing<span className="jcur">_</span></div>}
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '9px 0 7px' }}>
                {CHIPS.map(c => <button key={c} onClick={() => send(c)} style={chip}>{c}</button>)}
              </div>
              <div style={{ display: 'flex', gap: 7 }}>
                <span style={{ color: C.cyan, alignSelf: 'center', fontFamily: mono }}>›</span>
                <input ref={inputRef} style={{ ...inp, fontFamily: mono }} value={input} placeholder="message JARVIS…"
                  onChange={e => setInput(e.target.value)} onKeyDown={onKey} disabled={thinking} />
                <button style={btn(C.green)} onClick={() => send()} disabled={thinking}>Send</button>
              </div>
            </div>

            <Section title="AGENT OPS FEED" count={events.length}>
              <div style={{ maxHeight: 220, overflowY: 'auto', fontFamily: mono, fontSize: 12 }}>
                {events.length === 0 && <Empty>AWAITING ACTIVITY — run an agent or log a call.</Empty>}
                {events.map(e => (
                  <div key={e.id} className="jln" style={{ padding: '3px 0', color: e.level === 'error' ? C.red : e.level === 'warn' ? C.amber : C.dim }}>
                    <span style={{ color: C.faint }}>[{(e.created_at || '').slice(11, 19)}]</span>{' '}
                    <span style={{ color: C.cyan }}>{(e.agent || '').toUpperCase()}</span> {e.message}
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* RIGHT — panels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Section title="TASKS" count={tasks.length}>
              {tasks.length === 0 && <Empty>AWAITING DATA — no open tasks.</Empty>}
              {tasks.map(t => (
                <Row key={t.id}>
                  <span style={{ fontSize: 13 }}><span style={{ color: C.faint }}>{t.owner || '·'}</span> {t.title}</span>
                  <button style={btn(C.green)} onClick={() => taskDone(t.id)}>✓</button>
                </Row>
              ))}
            </Section>

            <Section title="HOT PROSPECTS" count={hotProspects.length}>
              {hotProspects.length === 0 && <Empty>AWAITING DATA — log calls as interested/demo.</Empty>}
              {hotProspects.map(p => (
                <Row key={p.id}><span style={{ fontSize: 13 }} onClick={() => tapProspect(p.business_name)} >{p.business_name} <span style={{ color: C.faint }}>[{p.status}]</span></span>
                  {p.phone && <a href={`tel:${p.phone}`} style={{ color: C.cyan, fontFamily: mono, fontSize: 12, textDecoration: 'none' }}>{p.phone}</a>}</Row>
              ))}
            </Section>

            <Section title="TRIAL MONITOR" count={trials.length}>
              {trials.length === 0 && <Empty>AWAITING DATA — no live trials.</Empty>}
              {trials.map((t, i) => (
                <Row key={i}><span style={{ fontSize: 13 }}>{t.business_name}</span>
                  <span className={t.churn_risk ? 'jred' : ''} style={{ color: t.churn_risk ? C.red : C.dim, fontSize: 12, fontFamily: mono, padding: t.churn_risk ? '1px 5px' : 0, borderRadius: 5 }}>{t.days_remaining}d · {t.leads_captured} leads{t.churn_risk ? ' ⚠' : ''}</span></Row>
              ))}
            </Section>

            <Section title="CAPTURED LEADS" count={leads.length}>
              {leads.length === 0 && <Empty>AWAITING DATA — submit the capture form to test.</Empty>}
              {leads.slice(0, 8).map(l => (
                <div key={l.id} className={flashLeads[l.id] ? 'jflash' : ''} style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.lineSoft}`, padding: '6px 0', fontSize: 12 }}>
                  <span>{l.name || '—'} {l.phone}{l.photo_urls?.length ? ' 📷' : ''}<div style={{ color: C.faint }}>{l.client_name} · {l.job_type || l.source}</div></span>
                  <span style={{ color: C.dim, fontFamily: mono }}>{l.status}</span>
                </div>
              ))}
            </Section>

            <Section title="AGENTS">
              {AGENTS.map(([id, label]) => {
                const e = lastByAgent[id]
                return (
                  <div key={id} style={{ borderTop: `1px solid ${C.lineSoft}`, padding: '7px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>{label}</span>
                      <button style={btn()} disabled={!!busy} onClick={() => runAgent(id, label)}>{busy === label ? '…' : 'RUN NOW'}</button>
                    </div>
                    <div style={{ color: C.faint, fontSize: 11, marginTop: 2 }}>{e ? `${(e.created_at || '').slice(11, 16)} · ${e.message.slice(0, 46)}` : 'no runs yet'}</div>
                  </div>
                )
              })}
            </Section>
          </div>
        </div>

        {/* FOOTER ops */}
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.line}`, alignItems: 'center' }}>
          <button style={btn(C.green)} onClick={() => run('Daily briefing', () => cron.morning(key))} disabled={!!busy}>Run daily briefing</button>
          <button style={btn(C.cyan)} onClick={seed} disabled={!!busy}>Seed demo</button>
          <button style={btn(C.red)} onClick={() => { if (confirm('Delete ALL demo/seed rows? Real data is untouched.')) run('Wipe seed', () => salesOps.wipeSeed(key)) }} disabled={!!busy}>Wipe seed</button>
          <a href="/leads" style={{ ...btn(C.faint), textDecoration: 'none' }}>Barber dashboard →</a>
          {busy && <span style={{ color: C.dim, fontFamily: mono, fontSize: 12 }}>{busy}…</span>}
        </div>
      </div>
    </div>
  )
}

// ── bits ─────────────────────────────────────────────────────────────
const shell = { minHeight: '100vh', background: C.bg, position: 'relative' }
const chip = { background: '#0c0f13', border: `1px solid ${C.line}`, color: C.cyan, borderRadius: 99, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: mono }

const Boot = ({ onSkip }) => (
  <div onClick={onSkip} style={{ position: 'fixed', inset: 0, zIndex: 50, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: mono, cursor: 'pointer' }}>
    <div className="jglow" style={{ color: C.cyan, fontSize: 40, fontWeight: 800, letterSpacing: 8 }}>JARVIS</div>
    <div style={{ color: C.dim, fontSize: 12, marginTop: 12 }}>initialising trades operations core<span className="jcur">_</span></div>
    <div style={{ color: C.faint, fontSize: 10, marginTop: 20 }}>click to skip</div>
  </div>
)
const Dot = ({ ok }) => <span style={{ width: 8, height: 8, borderRadius: 99, background: ok ? C.green : C.red, boxShadow: `0 0 7px ${ok ? C.green : C.red}`, display: 'inline-block' }} />
const Metric = ({ label, value, color = C.text, big }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ fontFamily: mono, fontWeight: 800, color, fontSize: big ? 26 : 18, lineHeight: 1 }}>{value}</div>
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
  if (role === 'jarvis') return <div className="jln" style={{ margin: '2px 0 9px', color: C.cyan, whiteSpace: 'pre-wrap' }}><span style={{ color: C.faint }}>JARVIS:</span> {text}</div>
  if (role === 'err') return <div className="jln" style={{ margin: '2px 0', color: C.red, whiteSpace: 'pre-wrap' }}>✕ {text}</div>
  return <div className="jln" style={{ margin: '2px 0', color: C.faint, whiteSpace: 'pre-wrap' }}>· {text}</div>
}
