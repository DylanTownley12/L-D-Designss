import { useState, useEffect, useRef, useCallback } from 'react'
import { holidays as holidayApi } from '../api/client'
import {
  Plane, Heart, MapPin, Star, Send, X, RefreshCcw, Sparkles, Compass,
  Wallet, Clock, CheckCircle2, Sun,
} from 'lucide-react'

/* ── Design system (matches WAR ROOM / JARVIS) ── */
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
  pink: '#f472b6',
  text: 'rgba(255,255,255,0.88)',
  textMid: 'rgba(255,255,255,0.42)',
  textDim: 'rgba(255,255,255,0.16)',
  mono: '"JetBrains Mono", monospace',
}
const label = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panel = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, ...extra })

const PREF_LABELS = {
  timing: 'WHEN', budget_total_gbp: 'BUDGET', departure_airport: 'FLY FROM',
  vibe: 'VIBE', weather: 'WEATHER', accommodation: 'STAY',
  flight_tolerance: 'MAX FLIGHT', interests: 'INTO', dealbreakers: 'NO-GOS',
}

const fmtGBP = (v) => {
  const n = Number(v)
  if (!n || Number.isNaN(n)) return null
  return `£${Math.round(n).toLocaleString()}`
}

function Btn({ onClick, href, color = C.cyan, children, solid = false, disabled = false, title, style: extra = {} }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
    fontFamily: C.mono, letterSpacing: '0.02em', cursor: disabled ? 'not-allowed' : 'pointer',
    textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.13s ease',
    border: `1px solid ${color}${solid ? '' : '30'}`,
    background: solid ? color : `${color}14`,
    color: solid ? '#001018' : color,
    opacity: disabled ? 0.4 : 1,
    ...extra,
  }
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={base} title={title}>{children}</a>
  return <button onClick={onClick} disabled={disabled} style={base} title={title}>{children}</button>
}

function Chip({ label: l, value, color = C.cyan }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 14px', borderRadius: 9, background: `${color}0c`, border: `1px solid ${color}22`, minWidth: 84 }}>
      <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', color: `${color}99`, fontFamily: C.mono }}>{l}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: 'white', fontFamily: C.mono, lineHeight: 1.2, whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

function SectionHead({ dot, Icon, title, count, accent = C.cyan, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: `1px solid ${C.borderDim}`, flexShrink: 0 }}>
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

/* ── Chat bubble ── */
function Msg({ m }) {
  const isUser = m.role === 'user'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', animation: 'fadeSlideUp 0.25s ease' }}>
      <span style={{ ...label({ fontSize: 7.5, marginBottom: 3 }), color: isUser ? `${C.gold}70` : `${C.cyan}60` }}>
        {isUser ? 'DYLAN' : 'CONCIERGE'}
      </span>
      <div style={{
        maxWidth: '88%', padding: '9px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55, color: C.text,
        background: isUser ? 'rgba(212,168,67,0.1)' : 'rgba(0,212,255,0.07)',
        border: `1px solid ${isUser ? 'rgba(212,168,67,0.22)' : 'rgba(0,212,255,0.14)'}`,
        borderTopRightRadius: isUser ? 3 : 10,
        borderTopLeftRadius: isUser ? 10 : 3,
      }}>
        {m.content}
      </div>
    </div>
  )
}

/* ── Match score badge ── */
function MatchBadge({ score }) {
  const c = score >= 85 ? C.green : score >= 70 ? C.cyan : C.amber
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, fontFamily: C.mono, padding: '3px 9px', borderRadius: 99,
      color: c, background: `${c}12`, border: `1px solid ${c}30`, whiteSpace: 'nowrap',
    }}>
      {score}% MATCH
    </span>
  )
}

/* ── Recommendation card ── */
function RecCard({ rec, airport, onStatus, busy }) {
  const saved = rec.status === 'shortlisted'
  const total = fmtGBP(rec.est_cost_total)
  const pp = fmtGBP(rec.est_cost_pp)
  const q = encodeURIComponent(`flights from ${airport || 'Manchester'} to ${rec.destination}`)
  const flightsUrl = `https://www.google.com/travel/flights?q=${q}`
  const staysUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${rec.destination}${rec.country ? ', ' + rec.country : ''}`)}`

  return (
    <div style={{
      ...panel({ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }),
      border: `1px solid ${saved ? 'rgba(212,168,67,0.4)' : C.border}`,
      boxShadow: saved ? 'inset 0 0 30px rgba(212,168,67,0.05)' : 'none',
      animation: 'fadeSlideUp 0.3s ease',
    }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, fontFamily: C.mono, color: rec.rank === 1 ? C.gold : C.textMid,
            border: `1px solid ${rec.rank === 1 ? `${C.gold}40` : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 6, padding: '2px 6px', flexShrink: 0,
          }}>
            #{rec.rank}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{rec.destination}</div>
            <div style={{ ...label({ fontSize: 8.5, letterSpacing: '0.14em' }), color: C.textMid, marginTop: 2 }}>{rec.country}</div>
          </div>
        </div>
        <MatchBadge score={rec.match_score || 0} />
      </div>

      {/* meta row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, fontFamily: C.mono, color: C.textMid }}>
        {total && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: C.green, fontWeight: 700 }}>
            <Wallet size={12} /> {total} for 2{pp ? ` · ${pp}pp` : ''}
          </span>
        )}
        {rec.flight_time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Plane size={12} /> {rec.flight_time}</span>}
        {rec.best_time && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> {rec.best_time}</span>}
      </div>

      {rec.summary && <p style={{ fontSize: 12, lineHeight: 1.6, color: C.text, margin: 0 }}>{rec.summary}</p>}

      {(rec.highlights || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {rec.highlights.map((h, i) => (
            <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.14)', color: `${C.cyan}cc`, fontFamily: C.mono }}>
              {h}
            </span>
          ))}
        </div>
      )}

      {rec.stay_area && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.textMid }}>
          <MapPin size={12} color={C.pink} /> Stay: <span style={{ color: C.text }}>{rec.stay_area}</span>
        </div>
      )}

      {rec.tips && <p style={{ fontSize: 11, lineHeight: 1.55, color: C.textMid, margin: 0, fontStyle: 'italic' }}>💡 {rec.tips}</p>}

      {/* actions */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 'auto', paddingTop: 4 }}>
        <Btn
          color={C.gold}
          solid={saved}
          disabled={busy}
          onClick={() => onStatus(rec.id, saved ? 'suggested' : 'shortlisted')}
          title={saved ? 'Remove from shortlist' : 'Save to shortlist'}
        >
          <Star size={12} fill={saved ? '#001018' : 'none'} /> {saved ? 'SAVED' : 'SHORTLIST'}
        </Btn>
        <Btn href={flightsUrl} color={C.cyan} title="Search live flight prices"><Plane size={12} /> FLIGHTS</Btn>
        <Btn href={staysUrl} color={C.cyan} title="Search hotels on Booking.com"><MapPin size={12} /> STAYS</Btn>
        {!saved && (
          <Btn color={C.red} disabled={busy} onClick={() => onStatus(rec.id, 'dismissed')} title="Not for us">
            <X size={12} /> PASS
          </Btn>
        )}
      </div>
    </div>
  )
}

export default function Holidays() {
  const [trip, setTrip] = useState(null)
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [searching, setSearching] = useState(false)
  const [tab, setTab] = useState('all')
  const [err, setErr] = useState(null)
  const [busyRec, setBusyRec] = useState(null)
  const chatRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await holidayApi.getTrip()
      setTrip(res.trip)
      setRecs(res.recommendations || [])
      setErr(null)
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const el = chatRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [trip?.conversation?.length, sending])

  const conversation = trip?.conversation || []
  const prefs = trip?.preferences || {}
  const lastMsg = conversation[conversation.length - 1]
  const quickReplies = (!sending && lastMsg?.role === 'assistant' && lastMsg.quick_replies) || []
  const answered = Object.keys(prefs).length
  const canSearch = trip && !searching && (answered >= 3 || ['ready', 'searched'].includes(trip.status))
  const shortlisted = recs.filter(r => r.status === 'shortlisted')
  const visible = tab === 'shortlisted' ? shortlisted : recs.filter(r => r.status !== 'dismissed')
  const budget = prefs.budget_total_gbp ? String(prefs.budget_total_gbp) : '—'

  const sendAnswer = async (text) => {
    const answer = (text ?? input).trim()
    if (!answer || sending || !trip) return
    setInput('')
    setSending(true)
    setErr(null)
    // show Dylan's message instantly while the Concierge thinks
    setTrip(t => ({ ...t, conversation: [...(t.conversation || []), { role: 'user', content: answer }] }))
    try {
      const res = await holidayApi.answer(answer)
      setTrip(res.trip)
      setRecs(res.recommendations || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setSending(false)
    }
  }

  const runSearch = async () => {
    if (!canSearch) return
    setSearching(true)
    setErr(null)
    setTab('all')
    try {
      const res = await holidayApi.search()
      setTrip(res.trip)
      setRecs(res.recommendations || [])
    } catch (e) {
      setErr(e.message)
    } finally {
      setSearching(false)
    }
  }

  const setRecStatus = async (id, status) => {
    setBusyRec(id)
    try {
      await holidayApi.setRecStatus(id, status)
      setRecs(rs => rs.map(r => (r.id === id ? { ...r, status } : r)))
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusyRec(null)
    }
  }

  const startNewTrip = async () => {
    setLoading(true)
    setErr(null)
    try {
      const res = await holidayApi.newTrip()
      setTrip(res.trip)
      setRecs([])
      setTab('all')
    } catch (e) {
      setErr(e.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.textMid, fontFamily: C.mono, fontSize: 11, letterSpacing: '0.2em' }}>
        <Plane size={14} color={C.cyan} style={{ animation: 'orbBreathe 1.5s ease-in-out infinite' }} /> LOADING HOLIDAY HQ…
      </div>
    )
  }

  return (
    <div style={{ padding: '18px 20px 28px', maxWidth: 1500, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,212,255,0.07)', border: '1px solid rgba(0,212,255,0.2)' }}>
            <Plane size={18} color={C.cyan} />
          </div>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 800, color: 'white', letterSpacing: '-0.01em', margin: 0, lineHeight: 1.1 }}>
              HOLIDAY HQ
            </h1>
            <div style={{ ...label({ fontSize: 8.5 }), color: `${C.pink}90`, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Heart size={9} fill={`${C.pink}90`} color={`${C.pink}90`} /> PERSONAL — DYLAN + HER · 2 TRAVELLERS
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="BUDGET (2)" value={budget} color={C.green} />
          <Chip label="PROFILE" value={`${Math.min(answered, 9)} ANSWERS`} color={C.cyan} />
          <Chip label="FOUND" value={recs.filter(r => r.status !== 'dismissed').length} color={C.cyan} />
          <Chip label="SHORTLIST" value={shortlisted.length} color={C.gold} />
          <Btn color={C.red} onClick={startNewTrip} title="Archive this trip and start fresh">
            <RefreshCcw size={12} /> NEW TRIP
          </Btn>
        </div>
      </div>

      {err && (
        <div style={{ ...panel({ padding: '10px 14px', marginBottom: 14 }), border: `1px solid ${C.red}40`, color: C.red, fontSize: 12, fontFamily: C.mono }}>
          ⚠ {err}
        </div>
      )}

      {/* ── Main grid ── */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', flexWrap: 'wrap' }}>

        {/* ── CONCIERGE — interview ── */}
        <div style={{ ...panel(), flex: '1 1 360px', maxWidth: 480, display: 'flex', flexDirection: 'column', height: '74vh', minHeight: 480 }}>
          <SectionHead
            dot
            title="CONCIERGE — TRIP INTERVIEW"
            accent={trip?.status === 'interviewing' ? C.green : C.cyan}
            right={
              <span style={{ ...label({ fontSize: 8 }), color: trip?.status === 'interviewing' ? `${C.green}90` : `${C.gold}90` }}>
                {trip?.status === 'interviewing' ? 'ASKING QUESTIONS' : trip?.status === 'ready' ? 'PROFILE COMPLETE' : 'REFINE ANYTIME'}
              </span>
            }
          />

          {/* messages */}
          <div ref={chatRef} style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {conversation.map((m, i) => <Msg key={i} m={m} />)}
            {sending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: `${C.cyan}70`, fontSize: 10, fontFamily: C.mono, letterSpacing: '0.15em' }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, animation: 'ping 1s cubic-bezier(0,0,0.2,1) infinite' }} />
                CONCIERGE IS THINKING…
              </div>
            )}
          </div>

          {/* quick replies */}
          {quickReplies.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 10px' }}>
              {quickReplies.map((qr, i) => (
                <button
                  key={i}
                  onClick={() => sendAnswer(qr)}
                  style={{
                    fontSize: 11, fontFamily: C.mono, fontWeight: 600, padding: '5px 11px', borderRadius: 99, cursor: 'pointer',
                    background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)', color: C.cyan, transition: 'all 0.13s ease',
                  }}
                >
                  {qr}
                </button>
              ))}
            </div>
          )}

          {/* input */}
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: `1px solid ${C.borderDim}` }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendAnswer()}
              placeholder="Type your answer…"
              disabled={sending}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8,
                padding: '8px 12px', fontSize: 12.5, color: 'white', outline: 'none', fontFamily: 'inherit',
              }}
            />
            <Btn color={C.cyan} solid onClick={() => sendAnswer()} disabled={sending || !input.trim()}>
              <Send size={12} />
            </Btn>
          </div>

          {/* profile + search CTA */}
          <div style={{ padding: '10px 14px 14px', borderTop: `1px solid ${C.borderDim}` }}>
            {answered > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                {Object.entries(prefs).filter(([k]) => !k.startsWith('_')).slice(0, 12).map(([k, v]) => (
                  <span key={k} style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 99, background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', color: `${C.gold}cc`, fontFamily: C.mono }}>
                    {(PREF_LABELS[k] || k.replace(/_/g, ' ').toUpperCase())}: {String(v).slice(0, 34)}
                  </span>
                ))}
              </div>
            )}
            <Btn
              color={C.gold}
              solid
              disabled={!canSearch}
              onClick={runSearch}
              title={canSearch ? 'Send the Scout hunting' : 'Answer at least 3 questions first'}
              style={{ width: '100%', justifyContent: 'center', padding: '10px 0', fontSize: 12, letterSpacing: '0.12em' }}
            >
              <Sparkles size={13} />
              {searching ? 'SCOUT SEARCHING…' : trip?.status === 'searched' ? 'SEARCH AGAIN' : 'FIND HOLIDAYS'}
            </Btn>
          </div>
        </div>

        {/* ── SCOUT — destinations ── */}
        <div style={{ ...panel(), flex: '2 1 540px', display: 'flex', flexDirection: 'column', minHeight: 480 }}>
          <SectionHead
            Icon={Compass}
            title="SCOUT — DESTINATIONS"
            count={visible.length}
            accent={C.gold}
            right={
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', 'shortlisted'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      fontSize: 9, fontFamily: C.mono, fontWeight: 700, letterSpacing: '0.14em', padding: '4px 10px',
                      borderRadius: 99, cursor: 'pointer', textTransform: 'uppercase', transition: 'all 0.13s ease',
                      background: tab === t ? 'rgba(212,168,67,0.14)' : 'transparent',
                      border: `1px solid ${tab === t ? 'rgba(212,168,67,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: tab === t ? C.gold : C.textMid,
                    }}
                  >
                    {t === 'all' ? 'ALL' : `SAVED ${shortlisted.length ? `(${shortlisted.length})` : ''}`}
                  </button>
                ))}
              </div>
            }
          />

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {searching ? (
              <div style={{ height: '100%', minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                <Compass size={30} color={C.gold} style={{ animation: 'spin 3s linear infinite' }} />
                <div style={{ ...label({ fontSize: 10 }), color: `${C.gold}bb` }}>SCOUT IS HUNTING DESTINATIONS…</div>
                <div style={{ fontSize: 11, color: C.textMid, maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
                  Weighing your budget, dates and vibe against flight times and seasons. ~30 seconds.
                </div>
              </div>
            ) : visible.length === 0 ? (
              <div style={{ height: '100%', minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Sun size={28} color={`${C.gold}60`} />
                <div style={{ ...label({ fontSize: 10 }), color: C.textMid }}>
                  {tab === 'shortlisted' ? 'NOTHING SHORTLISTED YET' : 'NO DESTINATIONS YET'}
                </div>
                <div style={{ fontSize: 11.5, color: C.textMid, maxWidth: 320, textAlign: 'center', lineHeight: 1.7 }}>
                  {tab === 'shortlisted'
                    ? 'Hit SHORTLIST on the picks you both like — they collect here.'
                    : 'Answer the Concierge’s questions on the left, then hit FIND HOLIDAYS and the Scout will bring back your 5 best-fit trips.'}
                </div>
              </div>
            ) : (
              <>
                {trip?.scout_overview && tab === 'all' && (
                  <div style={{
                    display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 13px', marginBottom: 14, borderRadius: 10,
                    background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.18)',
                  }}>
                    <CheckCircle2 size={14} color={C.gold} style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 11.5, lineHeight: 1.6, color: C.text, margin: 0 }}>{trip.scout_overview}</p>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                  {visible.map(rec => (
                    <RecCard
                      key={rec.id}
                      rec={rec}
                      airport={prefs.departure_airport}
                      onStatus={setRecStatus}
                      busy={busyRec === rec.id}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
