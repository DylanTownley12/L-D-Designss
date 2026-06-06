import { useState, useEffect, useRef, useCallback } from 'react'
import { team as teamApi, ops as opsApi, payments as payApi } from '../api/client'
import {
  Search, BarChart2, ScanSearch, Palette, Megaphone, Zap, Gem, Activity, Network,
  CheckCircle2, X, AlertCircle, RotateCcw, RefreshCcw, MessageSquare, Send, Globe,
  Brain, Crown, ShieldCheck,
} from 'lucide-react'

/* ── Design system (matches Workforce / JARVIS) ── */
const C = {
  bg: '#02020e',
  panel: 'rgba(0, 8, 28, 0.7)',
  border: 'rgba(0, 212, 255, 0.1)',
  borderDim: 'rgba(0, 212, 255, 0.06)',
  cyan: '#00D4FF',
  gold: '#D4A843',
  green: '#00FF88',
  amber: '#fbbf24',
  red: '#FF3355',
  orange: '#f97316',
  text: 'rgba(255,255,255,0.88)',
  textMid: 'rgba(255,255,255,0.42)',
  textDim: 'rgba(255,255,255,0.16)',
  mono: '"JetBrains Mono", monospace',
}
const label = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panel = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, ...extra })

const TEAM_META = {
  scout:    { Icon: Search,    color: '#3b82f6' },
  gap:      { Icon: BarChart2, color: '#a855f7' },
  judge:    { Icon: ScanSearch,color: '#8b5cf6' },
  maker:    { Icon: Palette,   color: '#06b6d4' },
  reach:    { Icon: Megaphone, color: '#f97316' },
  executor: { Icon: Zap,       color: '#eab308' },
  closer:   { Icon: Gem,       color: '#22c55e' },
  profit:   { Icon: Activity,  color: '#10b981' },
  chief:    { Icon: Network,   color: '#D4A843' },
}
const metaFor = (n) => TEAM_META[n] || { Icon: Brain, color: '#6b7280' }

const STATUS = {
  working: { c: C.green, t: 'WORKING' },
  done:    { c: C.cyan,  t: 'DONE TODAY' },
  stuck:   { c: C.red,   t: 'STUCK' },
  idle:    { c: 'rgba(255,255,255,0.18)', t: 'STANDBY' },
}

function relTime(iso) {
  if (!iso) return ''
  const d = Date.now() - new Date(iso).getTime()
  if (d < 0) return 'just now'
  if (d < 60000) return `${Math.floor(d / 1000)}s ago`
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  return `${Math.floor(d / 86400000)}d ago`
}

function waLink(phone, text) {
  if (!phone) return null
  let p = String(phone).replace(/\D/g, '')
  if (p.startsWith('0')) p = '44' + p.slice(1)
  if (!p.startsWith('44')) p = '44' + p
  return `https://wa.me/${p}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

/* ── Small action button ── */
function Btn({ onClick, href, color = C.cyan, children, solid = false, disabled = false, title }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    fontFamily: C.mono, letterSpacing: '0.02em', cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.13s ease',
    border: `1px solid ${color}${solid ? '' : '30'}`,
    background: solid ? color : `${color}14`,
    color: solid ? '#001018' : color,
    opacity: disabled ? 0.4 : 1,
  }
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={base} title={title}>{children}</a>
  return <button onClick={onClick} disabled={disabled} style={base} title={title}>{children}</button>
}

/* ── Header stat chip ── */
function Chip({ label: l, value, color = C.cyan }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 14px', borderRadius: 9, background: `${color}0c`, border: `1px solid ${color}22`, minWidth: 84 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', color: `${color}99`, fontFamily: C.mono }}>{l}</span>
      <span style={{ fontSize: 19, fontWeight: 800, color: 'white', fontFamily: C.mono, lineHeight: 1 }}>{value}</span>
    </div>
  )
}

/* ── Section header ── */
function SectionHead({ dot, Icon, title, count, accent = C.cyan, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.borderDim}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {dot && <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, boxShadow: `0 0 7px ${accent}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />}
        {Icon && <Icon size={13} color={accent} />}
        <span style={{ ...label(), color: C.textMid, fontSize: 9.5 }}>{title}</span>
        {count != null && count > 0 && (
          <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: `${accent}14`, color: accent, border: `1px solid ${accent}25`, fontFamily: C.mono, fontWeight: 700 }}>{count}</span>
        )}
      </div>
      {right}
    </div>
  )
}

/* ── Money action card ── */
const GROUP = {
  1: { t: 'CLOSE NOW', c: C.red },
  2: { t: 'REPLY',     c: C.orange },
  3: { t: 'FOLLOW UP', c: C.gold },
  4: { t: 'SEND',      c: C.cyan },
}
function MoneyAction({ item, onToast }) {
  const g = GROUP[item.priority] || GROUP[4]
  const isIG = item.channel === 'instagram'
  const wa = waLink(item.phone, item.suggested_message)
  const [busy, setBusy] = useState(false)

  const copy = async () => {
    try { await navigator.clipboard.writeText(item.suggested_message || ''); onToast('Message copied') } catch { onToast('Copy failed') }
  }
  const payLink = async () => {
    setBusy(true)
    try {
      const { url } = await payApi.getLink(item.lead_id)
      if (url) { await navigator.clipboard.writeText(url).catch(() => {}); window.open(url, '_blank'); onToast('Payment link ready + copied') }
      else onToast('No link returned')
    } catch (e) { onToast(e.message?.includes('Stripe') || e.message?.includes('500') ? 'Stripe not configured yet' : `Link failed: ${e.message}`) }
    setBusy(false)
  }

  return (
    <div style={{ padding: '11px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `2px solid ${g.c}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: g.c, fontFamily: C.mono, padding: '1px 6px', borderRadius: 5, background: `${g.c}16` }}>{g.t}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.lead_name}</span>
            {item.city && <span style={{ fontSize: 10.5, color: C.textDim, fontFamily: C.mono }}>{item.city}</span>}
          </div>
          <div style={{ fontSize: 11, color: C.textMid, lineHeight: 1.4 }}>{(item.reasons || [])[0] || ''}</div>
        </div>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', fontFamily: C.mono, color: isIG ? '#f97316' : C.green, padding: '2px 7px', borderRadius: 5, background: isIG ? 'rgba(249,115,22,0.1)' : 'rgba(0,255,136,0.08)', border: `1px solid ${isIG ? 'rgba(249,115,22,0.2)' : 'rgba(0,255,136,0.15)'}`, flexShrink: 0 }}>
          {isIG ? 'MATE · IG' : 'YOU · WA'}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {item.priority === 1 && (
          <Btn onClick={payLink} color={C.green} solid disabled={busy} title="Create + copy Stripe deposit link">£ Payment link</Btn>
        )}
        {!isIG && wa && <Btn href={wa} color={C.green}><MessageSquare size={11} /> WhatsApp</Btn>}
        {isIG && item.instagram_url && <Btn href={item.instagram_url} color="#f97316"><Send size={11} /> Open IG</Btn>}
        {item.suggested_message && <Btn onClick={copy} color={C.cyan}>Copy script</Btn>}
        {item.preview_url && <Btn href={item.preview_url} color={C.textMid}><Globe size={11} /> Preview</Btn>}
      </div>
    </div>
  )
}

/* ── Approval card (the gate) ── */
function ApprovalCard({ a, onDecide }) {
  const [busy, setBusy] = useState(false)
  const m = metaFor(a.agent)
  const decide = async (d) => { setBusy(true); try { await onDecide(a.id, d) } catch {} setBusy(false) }
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <m.Icon size={13} color={m.color} />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{a.action}</span>
        {a.amount > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: C.gold, fontFamily: C.mono }}>£{a.amount}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textDim, fontFamily: C.mono }}>{a.agent} · {relTime(a.created_at)}</span>
      </div>
      {a.reason && <div style={{ fontSize: 11, color: C.textMid, marginBottom: 6, lineHeight: 1.45 }}>{a.reason}</div>}
      {a.preview && (
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', marginBottom: 8, whiteSpace: 'pre-wrap', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto' }}>{a.preview}</div>
      )}
      <div style={{ display: 'flex', gap: 7 }}>
        <Btn onClick={() => decide('approved')} color={C.green} solid disabled={busy}><CheckCircle2 size={11} /> Approve</Btn>
        <Btn onClick={() => decide('rejected')} color={C.red} disabled={busy}><X size={11} /> Reject</Btn>
      </div>
    </div>
  )
}

/* ── Blocker / fixable issue ── */
function BlockerCard({ b, onFixed, onToast }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const sev = { critical: C.red, warning: C.amber, info: C.cyan }[b.severity] || C.cyan
  const isButton = b.fix_type === 'button' && b.fix_button

  const runFix = async () => {
    setBusy(true)
    try { await opsApi.runFix(b.fix_button); setDone(true); onToast(`Fixed: ${b.title}`); onFixed?.() }
    catch (e) { onToast(`Fix failed: ${e.message}`) }
    setBusy(false)
  }

  return (
    <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `2px solid ${sev}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
        <AlertCircle size={14} color={sev} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text }}>{b.title}</div>
          <div style={{ fontSize: 11, color: C.textMid, marginTop: 2, lineHeight: 1.45 }}>{b.impact}</div>
          {!isButton && b.human_steps?.length > 0 && (
            <ul style={{ margin: '7px 0 0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {b.human_steps.map((s, i) => <li key={i} style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{s}</li>)}
            </ul>
          )}
        </div>
        <div style={{ flexShrink: 0 }}>
          {isButton ? (
            <Btn onClick={runFix} color={done ? C.green : sev} disabled={busy || done}>
              {busy ? <div style={{ width: 9, height: 9, border: `1.5px solid ${sev}60`, borderTopColor: sev, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                : done ? <><CheckCircle2 size={10} /> Done</>
                : <><Zap size={10} /> {b.fix_button.label}</>}
            </Btn>
          ) : (
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: C.amber, fontFamily: C.mono, padding: '3px 8px', borderRadius: 5, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)' }}>NEEDS YOU</span>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Stuck handoff row ── */
function StuckRow({ t, onRetry }) {
  const [busy, setBusy] = useState(false)
  const m = metaFor(t.assigned_to)
  const retry = async () => { setBusy(true); try { await onRetry(t.id) } catch {} setBusy(false) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <m.Icon size={13} color={m.color} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{t.type}</span>
        <span style={{ fontSize: 10.5, color: C.textDim, fontFamily: C.mono, marginLeft: 8 }}>{t.assigned_to} · {t.status}</span>
      </div>
      <Btn onClick={retry} color={C.cyan} disabled={busy}>
        {busy ? <div style={{ width: 9, height: 9, border: `1.5px solid ${C.cyan}60`, borderTopColor: C.cyan, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> : <><RotateCcw size={10} /> Retry</>}
      </Btn>
    </div>
  )
}

/* ── Agent card ── */
function AgentCard({ a, onOpen }) {
  const m = metaFor(a.name)
  const st = STATUS[a.status] || STATUS.idle
  return (
    <div onClick={() => onOpen(a.name)} style={{ ...panel({ cursor: 'pointer' }), padding: 13, borderLeft: `2px solid ${a.status === 'idle' ? 'transparent' : st.c}60`, transition: 'all 0.15s ease' }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,212,255,0.04)'}
      onMouseLeave={e => e.currentTarget.style.background = C.panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: `${m.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: a.status === 'working' ? `0 0 10px ${m.color}40` : 'none' }}>
          <m.Icon size={14} color={m.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{a.name}</div>
          <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono }}>{a.schedule}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: st.c, boxShadow: a.status !== 'idle' ? `0 0 6px ${st.c}` : 'none', animation: a.status === 'working' ? 'orbBreathe 1.4s ease-in-out infinite' : 'none' }} />
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', fontFamily: C.mono, color: st.c }}>{st.t}</span>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: C.textMid, lineHeight: 1.4, marginBottom: 6, minHeight: 28 }}>{a.role}</div>
      <div style={{ fontSize: 10.5, color: a.last_action ? 'rgba(255,255,255,0.5)' : C.textDim, fontFamily: C.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {a.last_action ? `↳ ${a.last_action}` : 'no activity yet'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 7 }}>
        <span style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono }}>{a.last_at ? relTime(a.last_at) : '—'}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {a.open_tasks > 0 && <span style={{ fontSize: 9.5, color: C.cyan, fontFamily: C.mono }}>{a.open_tasks} queued</span>}
          {a.stuck > 0 && <span style={{ fontSize: 9.5, color: C.red, fontFamily: C.mono }}>{a.stuck} stuck</span>}
        </div>
      </div>
    </div>
  )
}

/* ── Feed row (agent → agent) ── */
function FeedRow({ msg }) {
  const m = metaFor(msg.from_agent)
  const to = msg.to_agent || 'all'
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
      <m.Icon size={12} color={m.color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontFamily: C.mono, marginBottom: 1 }}>
          <span style={{ color: m.color, fontWeight: 700, textTransform: 'capitalize' }}>{msg.from_agent}</span>
          <span style={{ color: C.textDim }}> → {to}</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', lineHeight: 1.45 }}>{msg.message}</div>
      </div>
      <span style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, flexShrink: 0, paddingTop: 1 }}>{relTime(msg.created_at)}</span>
    </div>
  )
}

/* ── Directive drawer (talk to an agent) ── */
function DirectiveDrawer({ agent, schedule, feed, onClose, onSend }) {
  const m = metaFor(agent)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [agent])

  const thread = (feed || []).filter(x => x.from_agent === agent || x.to_agent === agent || (x.from_agent === 'founder' && x.to_agent === agent))

  const send = async () => {
    const msg = text.trim()
    if (!msg || busy) return
    setBusy(true)
    try { await onSend(agent, msg); setText(''); setSent(true); setTimeout(() => setSent(false), 2500) } catch {}
    setBusy(false)
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: 'rgba(2,2,14,0.97)', backdropFilter: 'blur(20px)', borderLeft: `1px solid ${m.color}25`, display: 'flex', flexDirection: 'column', zIndex: 1000, boxShadow: '-20px 0 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '16px 18px', borderBottom: `1px solid ${m.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: `linear-gradient(135deg, ${m.color}08 0%, transparent 100%)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${m.color}18`, border: `1px solid ${m.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 12px ${m.color}20` }}>
              <m.Icon size={15} color={m.color} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>{agent}</div>
              <div style={{ fontSize: 10, color: m.color, opacity: 0.7, fontFamily: C.mono, marginTop: 1 }}>runs {schedule}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: C.textMid, display: 'flex' }}><X size={14} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px' }}>
          {thread.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: C.textDim, fontSize: 11.5, fontFamily: C.mono, lineHeight: 1.6 }}>NO MESSAGES WITH {agent.toUpperCase()} YET</div>
          ) : thread.map(msg => <FeedRow key={msg.id} msg={msg} />)}
        </div>

        <div style={{ padding: '12px 18px', borderTop: `1px solid ${m.color}12`, background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 9.5, color: C.textDim, fontFamily: C.mono, marginBottom: 8, lineHeight: 1.5 }}>
            Leave a directive — {agent} reads its inbox on its next run ({schedule}). It won't send or spend without your approval.
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea ref={ref} value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={`Tell ${agent} what to do...`} rows={2}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: `1px solid ${text ? m.color + '40' : 'rgba(255,255,255,0.08)'}`, borderRadius: 10, padding: '9px 12px', color: C.text, fontSize: 12.5, resize: 'none', outline: 'none', fontFamily: 'Inter, sans-serif', lineHeight: 1.5, maxHeight: 120 }} />
            <button onClick={send} disabled={!text.trim() || busy} style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: text.trim() && !busy ? `linear-gradient(135deg, ${m.color}, ${m.color}cc)` : 'rgba(255,255,255,0.06)', border: 'none', cursor: text.trim() && !busy ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Send size={14} color={text.trim() && !busy ? '#000' : 'rgba(255,255,255,0.2)'} />
            </button>
          </div>
          {sent && <div style={{ fontSize: 10.5, color: C.green, fontFamily: C.mono, marginTop: 6 }}>✓ Directive posted to {agent}'s inbox</div>}
        </div>
      </div>
    </>
  )
}

/* ── Main ── */
export default function Hub() {
  const [cr, setCr] = useState(null)
  const [actions, setActions] = useState([])
  const [blockers, setBlockers] = useState([])
  const [summary, setSummary] = useState(null)
  const [openAgent, setOpenAgent] = useState(null)
  const [toast, setToast] = useState(null)
  const [healing, setHealing] = useState(false)

  const showToast = useCallback((m) => { setToast(m); setTimeout(() => setToast(null), 3000) }, [])

  const fetchAll = useCallback(async () => {
    const [c, a, b, s] = await Promise.allSettled([
      teamApi.controlRoom(), opsApi.actionQueue(14), opsApi.blockers(), teamApi.summary(),
    ])
    if (c.status === 'fulfilled') setCr(c.value)
    if (a.status === 'fulfilled') setActions(a.value.items || [])
    if (b.status === 'fulfilled') setBlockers(b.value.blockers || [])
    if (s.status === 'fulfilled') setSummary(s.value)
  }, [])

  useEffect(() => { fetchAll(); const t = setInterval(fetchAll, 20000); return () => clearInterval(t) }, [fetchAll])

  const decide = async (id, d) => { await teamApi.decide(id, d); showToast(`Approval ${d}`); fetchAll() }
  const retry = async (id) => { await teamApi.retryTask(id); showToast('Task re-queued'); fetchAll() }
  const retryAll = async () => { const { retried } = await teamApi.retryStuck(); showToast(`Re-queued ${retried || 0} task(s)`); fetchAll() }
  const sendDirective = async (agent, message) => { await teamApi.postMessage({ from_agent: 'founder', to_agent: agent, message }); fetchAll() }
  const selfHeal = async () => {
    setHealing(true)
    try {
      await teamApi.retryStuck()
      const fixable = blockers.filter(b => b.fix_type === 'button' && b.fix_button)
      for (const b of fixable) { try { await opsApi.runFix(b.fix_button) } catch {} }
      showToast('Self-heal run complete')
      await fetchAll()
    } catch (e) { showToast(`Self-heal: ${e.message}`) }
    setHealing(false)
  }

  const agents = cr?.agents || []
  const approvals = cr?.approvals || []
  const stuck = cr?.stuck_tasks || []
  const messages = cr?.messages || []
  const counts = cr?.counts || {}
  const buttonBlockers = blockers.filter(b => b.fix_type === 'button')
  const humanBlockers = blockers.filter(b => b.fix_type !== 'button')
  const openSchedule = openAgent ? (agents.find(a => a.name === openAgent)?.schedule || 'next run') : ''

  return (
    <>
      <div style={{ padding: '22px 24px', maxWidth: 1180, margin: '0 auto' }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
              <span style={label()}>AUTONOMOUS TEAM · CONTROL ROOM</span>
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, margin: 0 }}>War Room</h1>
            <p style={{ fontSize: 11.5, color: C.textMid, margin: '4px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={12} color={C.green} /> Agents auto-fix safe failures · sending, spending & Stripe need your tap
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <Chip label="APPROVALS" value={counts.pending_approvals ?? 0} color={counts.pending_approvals ? C.amber : C.cyan} />
            <Chip label="STUCK" value={counts.stuck ?? 0} color={counts.stuck ? C.red : C.cyan} />
            <Chip label="DONE TODAY" value={counts.done_today ?? 0} color={C.green} />
            <Chip label="MRR" value={`£${summary?.mrr_gbp ?? 0}`} color={C.gold} />
            <button onClick={selfHeal} disabled={healing} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 9, fontSize: 12, fontWeight: 700, border: 'none', cursor: healing ? 'not-allowed' : 'pointer', background: healing ? 'rgba(255,255,255,0.06)' : `linear-gradient(135deg, ${C.cyan}, #0088cc)`, color: healing ? C.textDim : '#001018', fontFamily: 'Inter, sans-serif' }}>
              {healing ? <><div style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /> Healing...</> : <><RefreshCcw size={13} /> Self-heal now</>}
            </button>
          </div>
        </div>

        {/* TWO COLUMN: money + (approvals/stuck) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, marginBottom: 16, alignItems: 'start' }}>
          {/* MONEY ACTIONS */}
          <div style={panel({ overflow: 'hidden' })}>
            <SectionHead dot Icon={Zap} title="TODAY'S MONEY ACTIONS" count={actions.length} accent={C.gold} />
            {actions.length === 0 ? (
              <div style={{ padding: '36px 20px', textAlign: 'center', color: C.textDim, fontSize: 11.5, fontFamily: C.mono, letterSpacing: '0.06em' }}>NO ACTIONS RIGHT NOW — PIPELINE IS QUIET</div>
            ) : actions.map((it, i) => <MoneyAction key={it.lead_id || i} item={it} onToast={showToast} />)}
          </div>

          {/* RIGHT STACK */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* APPROVALS */}
            <div style={panel({ overflow: 'hidden' })}>
              <SectionHead dot Icon={ShieldCheck} title="NEEDS YOUR APPROVAL" count={approvals.length} accent={approvals.length ? C.amber : C.cyan} />
              {approvals.length === 0 ? (
                <div style={{ padding: '24px 20px', textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>Nothing waiting — agents haven't staged anything</div>
              ) : approvals.map(a => <ApprovalCard key={a.id} a={a} onDecide={decide} />)}
            </div>

            {/* STUCK / AUTO-FIX */}
            <div style={panel({ overflow: 'hidden' })}>
              <SectionHead Icon={AlertCircle} title="STUCK — SAFE TO RETRY" count={stuck.length} accent={stuck.length ? C.red : C.cyan}
                right={stuck.length > 1 ? <button onClick={retryAll} style={{ fontSize: 10.5, color: C.cyan, background: 'none', border: `1px solid ${C.cyan}25`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontFamily: C.mono, fontWeight: 700 }}>Retry all</button> : null} />
              {stuck.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: C.textDim, fontSize: 11, fontFamily: C.mono }}>No stuck handoffs</div>
              ) : stuck.map(t => <StuckRow key={t.id} t={t} onRetry={retry} />)}
            </div>
          </div>
        </div>

        {/* SYSTEM ISSUES (blockers) */}
        {(buttonBlockers.length > 0 || humanBlockers.length > 0) && (
          <div style={panel({ overflow: 'hidden', marginBottom: 16 })}>
            <SectionHead Icon={Zap} title="SYSTEM ISSUES — ONE-CLICK SAFE FIX vs NEEDS YOU" count={blockers.length} accent={C.amber} />
            {buttonBlockers.map((b, i) => <BlockerCard key={`btn${i}`} b={b} onFixed={fetchAll} onToast={showToast} />)}
            {humanBlockers.map((b, i) => <BlockerCard key={`hum${i}`} b={b} onFixed={fetchAll} onToast={showToast} />)}
          </div>
        )}

        {/* THE 9 AGENTS */}
        <div style={{ marginBottom: 16 }}>
          <SectionHead dot Icon={Network} title="THE TEAM — CLICK TO LEAVE A DIRECTIVE" count={9} accent={C.cyan} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 11, marginTop: 12 }}>
            {agents.length === 0
              ? Array.from({ length: 9 }).map((_, i) => <div key={i} style={{ ...panel(), padding: 13, height: 116, opacity: 0.4 }} />)
              : agents.map(a => <AgentCard key={a.name} a={a} onOpen={setOpenAgent} />)}
          </div>
        </div>

        {/* TEAM FEED */}
        <div style={panel({ overflow: 'hidden' })}>
          <SectionHead dot Icon={MessageSquare} title="TEAM FEED — AGENT TO AGENT" count={messages.length} accent={C.green} />
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {messages.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: C.textDim, fontSize: 11.5, fontFamily: C.mono, letterSpacing: '0.06em' }}>NO CHATTER YET — AGENTS POST HERE WHEN THEY HAND OFF WORK</div>
            ) : messages.map(msg => <FeedRow key={msg.id} msg={msg} />)}
          </div>
        </div>
      </div>

      {/* DIRECTIVE DRAWER */}
      {openAgent && (
        <DirectiveDrawer agent={openAgent} schedule={openSchedule} feed={messages} onClose={() => setOpenAgent(null)} onSend={sendDirective} />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 22, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, background: 'rgba(0,8,28,0.95)', border: `1px solid ${C.cyan}40`, borderRadius: 10, padding: '11px 18px', fontSize: 12.5, color: C.text, fontFamily: C.mono, boxShadow: `0 8px 30px rgba(0,0,0,0.5), 0 0 20px ${C.cyan}20`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={14} color={C.green} /> {toast}
        </div>
      )}
    </>
  )
}
