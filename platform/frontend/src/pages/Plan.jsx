import { useState } from 'react'

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
  purple:    '#a855f7',
  text:      'rgba(255,255,255,0.88)',
  textMid:   'rgba(255,255,255,0.42)',
  textDim:   'rgba(255,255,255,0.16)',
  mono:      '"JetBrains Mono", monospace',
}
const lbl = (extra = {}) => ({ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.textDim, fontFamily: C.mono, ...extra })
const panelStyle = (extra = {}) => ({ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, ...extra })

// Each day maps directly to bottlenecks from the CTO audit.
// Claude tasks = actual code changes made that day.
// Dylan/Friend tasks = only things a human can do.
// OpenClaw = fully automated, no human input needed.
const PLAN = [
  {
    day: 1, date: '2026-06-04', label: 'Wed 4 Jun', week: 1,
    focus: 'Run preview URL fix + switch Stripe to LIVE — last two blockers before first money',
    bottlenecks: ['707 previews have broken URLs', 'Stripe still in test mode — no real money possible'],
    tasks: {
      dylan: [
        'Run the preview URL fix: Dashboard → Agents page → run "Fix Preview URLs" admin job (or tell Claude to POST /api/agents/admin/fix-preview-urls). Fixes 707 broken links — do this first.',
        'Switch Stripe to LIVE mode: stripe.com → Developers → API Keys → toggle to Live → copy the new STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET → update both in Railway Variables.',
        'Confirm WA ban is lifted: check dashboard for this morning\'s 9am batch. 10 messages sent with no errors = you\'re back. If not, tell Claude.',
      ],
      friend: [
        'Find 30 UK barbers on Instagram with no website link in bio — target: Manchester, Leeds, Liverpool, Birmingham, Sheffield. Save handle + shop name + city in a note. These are your DM targets.',
        'Send 10 personalised DMs from your list. Mention their actual shop name and city. Short: "Hiya — noticed you don\'t have a website. I build them for barbers in [city]. Already got a free preview ready for yours if you\'re interested?"',
        'Reply to any responses from today\'s DMs before end of day.',
      ],
      claude: [
        'Run fix-preview-urls: POST /api/agents/admin/fix-preview-urls — fixes all 707 broken preview URLs in one call',
        'Add "Send Payment Link" button to lead detail page on dashboard',
        'Add GET /api/previews/by-phone/{phone} endpoint so Baz looks up previews via API instead of a static list',
      ],
      openclaw: [
        'Hold the 9am batch until Dylan confirms previews are fixed',
        'Once confirmed — queue ready for tomorrow morning',
        'Monitor all inbound, alert Dylan immediately on any warm signal',
      ],
    },
  },
  {
    day: 2, date: '2026-06-05', label: 'Thu 5 Jun', week: 1,
    focus: 'First proper WA batch with working links — activate reply detection',
    bottlenecks: ['Follow-up channel bug (WA → email)', 'Quality ordering missing', 'Gmail reply detection off'],
    tasks: {
      dylan: [
        'At 9:30am: open dashboard → confirm 10 WA messages sent, no red errors in agent feed.',
        'Any barber replied this morning? Reply yourself immediately — same day, every time. Don\'t wait for Baz on warm leads.',
        'Review Outreach page → Pending Approvals — approve or rewrite any sales agent drafts queued up.',
      ],
      friend: [
        'Send 10 DMs — different city from yesterday. Note which city and how many sent.',
        'Reply personally to every response from yesterday\'s DMs. If they seem interested, offer to send a preview.',
        'Find 20 more barbers for tomorrow\'s list — Google Maps "barbers [city]", look for no website in listing.',
      ],
      claude: [
        'Fix follow-up sequences — WA-contacted leads now get WA follow-ups, not email',
        'Fix quality ordering — generate_whatsapp_campaign() orders by quality_score DESC so best targets go first',
        'Add Gmail reply polling every 15 mins — detects barber email replies and updates lead status automatically',
      ],
      openclaw: [
        '9am: first batch of 10 WA messages with working preview links, 5-7 min gaps',
        'Auto-reply every inbound using AGENTS.md playbook',
        'Alert Dylan within 60 seconds if any barber shows interest or asks about price',
      ],
    },
  },
  {
    day: 3, date: '2026-06-06', label: 'Fri 6 Jun', week: 1,
    focus: 'Close warm leads from first 2 days — every interested thread gets a response',
    bottlenecks: ['Multi-channel dedup missing', 'Instagram DMs not surfaced on dashboard'],
    tasks: {
      dylan: [
        'Read 8am CEO briefing — note any numbers that look wrong, tell Claude.',
        'Go through every "replied" and "interested" lead on dashboard — reply personally to each one. Check their conversation thread first so you know what Baz already said.',
        'Send Stripe link to any lead who asked about price or said yes: "Here\'s the link — just £75 to get started: [link]"',
      ],
      friend: [
        'Send 10 DMs — new city.',
        'Follow up Monday and Tuesday DMs that opened but didn\'t reply: "Hey, just checking you got my message?" — one follow-up each, that\'s it.',
        'For any thread with 2+ messages exchanged, try a 30-second voice note instead of text — casual, mention their shop name.',
      ],
      claude: [
        'Add multi-channel dedup guard — before generating outreach, check if lead already has a sent/queued message on any channel. Skip duplicates.',
        'Add Instagram DMs section to Outreach page with one-click Copy button so Dylan can paste and send manually',
      ],
      openclaw: [
        '9am batch — Day 3',
        'Day 1 follow-up sequences now triggering for leads that went quiet',
        'Email queue processing — first batch sending',
      ],
    },
  },
  {
    day: 4, date: '2026-06-07', label: 'Sat 7 Jun', week: 1,
    focus: 'Saturday review — close open threads, surface warm leads from the 113 already sent',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Write down real Week 1 numbers: WA sends, replies, reply rate %, leads marked "interested", revenue. Real numbers only.',
        'Go through every open warm thread — push each one to a yes or a no. If they\'ve seen the preview and gone quiet: "Still up for it? Happy to tweak anything on it."',
        'Open Outreach page → copy 5 Instagram DMs and send them from your Instagram account manually.',
      ],
      friend: [
        'Send 5 DMs today (Saturday — lighter).',
        'Go through all your DM threads this week — for any with 2+ messages exchanged, push them toward the preview: "Want me to show you what your site could look like?"',
        'Write down the most common thing barbers say when they actually reply — that\'s the most valuable data you can report.',
      ],
      claude: [
        'Add Pending Approvals section to Outreach page — sales agent drafts for interested leads with approve/edit/send buttons',
        'Scan all 113 outreach_sent leads: find any with inbound replies, surface them as a "Re-engage today" list on the dashboard — these are warmer than any new cold lead',
      ],
      openclaw: [
        'Weekend quiet mode — monitoring inbound only',
        'No proactive outreach today',
        'Alert Dylan immediately if any hot lead messages in',
      ],
    },
  },
  {
    day: 5, date: '2026-06-08', label: 'Sun 8 Jun', week: 1,
    focus: 'Light day — systems run themselves',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Morning and evening check — 10 mins each. CEO briefing, Baz alerts. Reply immediately to anything warm.',
        'Think: what\'s the most common thing barbers are saying back? Tell Claude tomorrow — I\'ll rewrite the opener around it.',
      ],
      friend: [
        'Find 20 more barbers for Monday\'s DM batch.',
        'Reply to any DMs that came in over the weekend.',
      ],
      claude: [
        'Nothing — automated systems run themselves today.',
      ],
      openclaw: [
        'Quiet monitoring only',
        'Follow-up sequences running in background',
      ],
    },
  },
  {
    day: 6, date: '2026-06-09', label: 'Mon 9 Jun', week: 2,
    focus: 'Week 2 — conversation threads live, rewrite opener from real objections',
    bottlenecks: ['No conversation thread on lead detail', 'Opener not updated from real replies yet'],
    tasks: {
      dylan: [
        'Tell Claude: most common objection this week — one sentence. I\'ll rewrite the WA opener around it today.',
        'Open lead detail for your 3 warmest leads — use the new conversation thread to see exactly what Baz said, then reply personally with a proper response to each.',
        'Write down Week 1 real numbers: total sent, total replies, reply rate %, deposits, revenue. No estimates.',
      ],
      friend: [
        'Send 10 DMs — different city.',
        'Report back: what are barbers actually saying? Quote exact words — Dylan and Claude need this to improve the opener.',
        'Pick your warmest DM thread and push it to a decision: "Want me to build you a free preview so you can see what it\'d look like?"',
      ],
      claude: [
        'Add conversation thread panel to lead detail — all outreach_messages chronological, colour-coded inbound/outbound',
        'Rewrite weakest A/B opener variant based on Dylan\'s objection feedback',
      ],
      openclaw: [
        '9am batch continues into Week 2',
        'Week 1 follow-up sequences active for all last-week leads',
        '8am: Week 1 stats summary emailed to Dylan',
      ],
    },
  },
  {
    day: 7, date: '2026-06-10', label: 'Tue 10 Jun', week: 2,
    focus: 'Push warm leads to a decision — draft closing messages for every replied lead',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Message your 3 warmest WA leads personally — reference their specific last message, push for a yes or a no. "A maybe just wastes both our time."',
        'Check Gmail inbox: did any barbers reply to emails? Reply personally to all of them today.',
        'Send Stripe link to any interested lead who hasn\'t paid yet. Don\'t overthink it — just send it.',
      ],
      friend: [
        'Send 10 DMs.',
        'Your 2 warmest DM conversations — offer to send a preview: "I\'ve actually already built a free preview for your shop — want to see it?"',
        'Voice note your 3 hottest leads — personal, casual, under 30 seconds. Mention their shop name. Voice notes get 3x higher open rate than text.',
      ],
      claude: [
        'For every lead with status "replied" or "interested": pull their conversation history, draft a personalised closing message Dylan can send in one click — surfaces on dashboard as "Ready to send" drafts',
        'A/B analysis on the 113 sends: which opener variant got more replies? Kill the loser, write a better replacement for tomorrow\'s batch based on what actually worked',
      ],
      openclaw: [
        '9am batch with updated opener variant',
        'Email queue second week — more contacts now enriched',
      ],
    },
  },
  {
    day: 8, date: '2026-06-11', label: 'Wed 11 Jun', week: 2,
    focus: 'Send that first Stripe link — close the warmest lead today',
    bottlenecks: ['Day 30 follow-up missing', 'Preview refresher sends broken links'],
    tasks: {
      dylan: [
        'Send the Stripe payment link to your single warmest lead today. Not tomorrow — today. "Ready when you are — here\'s the link: [link]. Just £75 to kick it off."',
        'Check email replies overnight — reply personally to every one. Same day, every time.',
        'Any lead marked "interested" that hasn\'t got a Stripe link yet? Send them one.',
      ],
      friend: [
        'Send 10 DMs. Keep momentum.',
        'Follow up DM list leads that haven\'t replied in 48h — one follow-up: "Did you get a chance to see my message?"',
        'Try a different opener today: "I built a free preview for your shop — want to see it?" — lead with the offer, not the pitch.',
      ],
      claude: [
        'Add Day 30 follow-up step to sequences — different tone, cold-lead revival message',
        'Preview refresher validates URL returns HTTP 200 before queuing follow-up — no more sending broken links',
      ],
      openclaw: [
        '9am batch continues',
        'Day 3 follow-ups triggering for Week 1 leads',
        'Email queue processing',
      ],
    },
  },
  {
    day: 9, date: '2026-06-12', label: 'Thu 12 Jun', week: 2,
    focus: 'Check for deposits — re-engage cold leads with a fresh angle',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Check Stripe dashboard: any deposits in? If yes — WhatsApp the barber within 10 minutes: "Sorted! I\'ll get started — just send me your opening hours and any photos whenever."',
        'Go through every open warm thread — reply to each one. Push for a yes or a no. Nothing stays unanswered.',
        'Check agent logs: anything failing silently? Flag red errors to Claude.',
      ],
      friend: [
        'Send 10 DMs.',
        'Your best performing DM so far — what made it work? Tell Dylan so you can repeat it.',
        'For your warmest DM lead: check if they have a phone number or email in bio — if yes, try WhatsApp directly. Higher conversion than Instagram DM.',
      ],
      claude: [
        'Find all leads contacted 7+ days ago with no reply and no follow-up — pull 10 of the highest quality_score ones, write a fresh re-engagement message with a completely different angle ("Wanted to show you what I built for a barber in [nearby city]..."), queue them for tomorrow\'s WA batch',
        'Analyse all inbound reply text so far — group by intent (interested, objection, wrong number, auto-reply). Surface the "warm but not yet interested" ones Dylan should personally message today',
      ],
      openclaw: [
        '9am batch',
        'Day 7 follow-ups triggering for all Week 1 leads',
      ],
    },
  },
  {
    day: 10, date: '2026-06-13', label: 'Fri 13 Jun', week: 2,
    focus: 'Friday closing push — get that deposit before the weekend',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Friday push: message your single warmest lead with a genuine offer — "Happy to drop the deposit to £50 if you want to lock it in this week." Close it today.',
        'Review Outreach page → Pending Approvals — approve or rewrite any outstanding drafts.',
        'Write down mid-point numbers: WA sends, replies, interested, deposits, revenue. How close to that first £75?',
      ],
      friend: [
        'Send 10 DMs.',
        'Your warmest DM lead — be direct: "Are you still up for it? I\'ve got a slot this week."',
        'Voice note your 3 hottest DM leads — short, personal, specific to their shop. Mention you\'ve already built their preview.',
      ],
      claude: [
        'City analysis on all sends to date: which UK cities have the best reply rate? Show it on dashboard, redirect tomorrow\'s WA batch to prioritise the top 3 cities',
        'Draft 5 personalised re-engagement messages for the 5 highest quality_score leads that never replied — specific to their business name and location, different angle from the original outreach, ready for Dylan to send manually',
      ],
      openclaw: [
        'Friday batch + 72h follow-ups for leads that went silent',
        'Weekend quiet mode starts tonight',
      ],
    },
  },
  {
    day: 11, date: '2026-06-14', label: 'Sat 14 Jun', week: 2,
    focus: 'Saturday — close anyone who surfaces, keep momentum going',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Morning check — CEO briefing, Baz alerts, overnight replies. 10 minutes.',
        'Anyone who messages about payment today — respond within 10 minutes. No exceptions.',
        'Send Stripe link to any warm lead you haven\'t sent one to yet.',
      ],
      friend: [
        'Send 5 DMs (lighter Saturday).',
        'Go through all warm DM threads from Week 2 — follow up anyone who went quiet after 2+ messages.',
        'Write down this week\'s numbers: DMs sent, replied, showed real interest — ready to report Monday.',
      ],
      claude: [
        'Nothing — all Week 2 fixes live.',
      ],
      openclaw: [
        'Quiet monitoring — inbound only',
        'No proactive outreach',
      ],
    },
  },
  {
    day: 12, date: '2026-06-15', label: 'Sun 15 Jun', week: 2,
    focus: 'Rest — think about Week 3 direction',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Reply to anything warm from the weekend.',
        'Think: is it working? More volume, better opener, different cities, or something different? Tell Claude tomorrow.',
      ],
      friend: [
        'Find 20 barbers for Monday\'s DM batch.',
        'Reply to any weekend DMs.',
      ],
      claude: [
        'Sunday health check — verify all cron jobs ran correctly this week. Flag any silent failures.',
      ],
      openclaw: [
        'Quiet mode — monitoring only',
      ],
    },
  },
  {
    day: 13, date: '2026-06-16', label: 'Mon 16 Jun', week: 2,
    focus: 'Final push — close every open thread before end of week',
    bottlenecks: ['Research/CMO insights never surfaced on dashboard'],
    tasks: {
      dylan: [
        'Message EVERY open warm thread today — personal, specific, push for a yes or a no. By end of day every conversation has a clear next step or is closed.',
        'Tell Claude your Week 3 direction: more volume, different city, better closer, or something else.',
        'Send Stripe link to every interested lead who hasn\'t paid — if they\'ve been interested 3+ days, follow up: "Still want to get this sorted?"',
      ],
      friend: [
        'Find 20 new barbers for the list.',
        'Send 15 DMs — bigger Monday push.',
        'WhatsApp call your 2 warmest DM leads. Live call closes better than text. 2 minutes each.',
      ],
      claude: [
        'Surface research + CMO insights — top 3 cities by reply rate, auto-bias lead_finder to target those first',
        'Draft Week 3 plan based on Dylan\'s direction',
      ],
      openclaw: [
        '9am batch continues',
        'Day 14 follow-ups triggering for Week 1 leads — final automated touch',
        '8am: full 2-week stats summary emailed to Dylan',
      ],
    },
  },
  {
    day: 14, date: '2026-06-17', label: 'Tue 17 Jun', week: 2,
    focus: '2-week review — first deposit landed or final push to get it',
    bottlenecks: ['ALL CORE BOTTLENECKS FIXED'],
    tasks: {
      dylan: [
        'Write down real 2-week numbers: total sent (WA + email), total replies, reply rate %, deposits received, revenue. No estimates.',
        'Message all remaining warm leads one final time — personal, honest, short: "Still thinking about it? No pressure — just want to know either way."',
        'Follow up every Stripe link sent but not clicked: "Did the payment link work OK? Just checking it went through."',
      ],
      friend: [
        'Final push: message every warm DM lead — "Last chance to claim your free preview before I move on to other barbers in [city]."',
        'Voice note your 3 hottest leads — short, real, mention their shop name. No script.',
        'Write down 2-week totals: DMs sent, replied, showed real interest — share with Dylan for the review.',
      ],
      claude: [
        'Full 2-week report: sends/replies/conversion by channel, city, variant — emailed to Dylan at 8am',
        'Week 3 plan ready to share immediately after Dylan\'s direction input',
        'Update HANDOFF.md: mark completed items as done, add outstanding items to Tier 1',
      ],
      openclaw: [
        '9am batch — Week 3 openers starting',
        '2-week stats in 8am briefing',
        'All systems running into Week 3',
      ],
    },
  },
]

const PEOPLE = [
  { key: 'dylan',    label: 'Dylan',     color: C.gold,   panelBg: 'rgba(212,168,67,0.05)',  panelBorder: 'rgba(212,168,67,0.18)'  },
  { key: 'friend',   label: 'Friend',    color: C.purple, panelBg: 'rgba(168,85,247,0.05)',  panelBorder: 'rgba(168,85,247,0.18)'  },
  { key: 'claude',   label: 'Claude',    color: C.cyan,   panelBg: 'rgba(0,212,255,0.04)',   panelBorder: 'rgba(0,212,255,0.18)'   },
  { key: 'openclaw', label: 'OpenClaw',  color: C.green,  panelBg: 'rgba(0,255,136,0.04)',   panelBorder: 'rgba(0,255,136,0.18)'   },
]

function taskKey(day, person, idx) { return `plan_d${day}_${person}_${idx}` }
function loadChecked() { try { return JSON.parse(localStorage.getItem('ld_plan_checked') || '{}') } catch { return {} } }
function saveChecked(state) { localStorage.setItem('ld_plan_checked', JSON.stringify(state)) }
function getTodayDay() {
  const today = new Date().toISOString().slice(0, 10)
  const match = PLAN.find(d => d.date === today)
  return match?.day ?? null
}

export default function Plan() {
  const [checked, setChecked] = useState(loadChecked)
  const [expandedDay, setExpandedDay] = useState(getTodayDay() ?? 1)
  const todayDay = getTodayDay()

  const toggle = (day, person, idx) => {
    const key = taskKey(day, person, idx)
    const next = { ...checked, [key]: !checked[key] }
    setChecked(next)
    saveChecked(next)
  }

  const dayProgress = (day) => {
    const all = PEOPLE.flatMap(p => (PLAN.find(d => d.day === day)?.tasks[p.key] || []).map((_, i) => taskKey(day, p.key, i)))
    const done = all.filter(k => checked[k]).length
    return { done, total: all.length }
  }

  const totalProgress = () => {
    const all = PLAN.flatMap(d => PEOPLE.flatMap(p => (d.tasks[p.key] || []).map((_, i) => taskKey(d.day, p.key, i))))
    const done = all.filter(k => checked[k]).length
    return { done, total: all.length }
  }

  const { done: totalDone, total: totalTotal } = totalProgress()
  const pct = totalTotal > 0 ? Math.round((totalDone / totalTotal) * 100) : 0
  const week1 = PLAN.filter(d => d.week === 1)
  const week2 = PLAN.filter(d => d.week === 2)

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
          <span style={lbl()}>14-DAY REVENUE ROADMAP</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, margin: 0 }}>Strategy</h1>
        <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
          4–17 Jun 2026 · Each day targets specific bottlenecks · By Day 14: all 25 fixed, first sale closed
        </p>
        <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          {PEOPLE.map(p => (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, boxShadow: `0 0 5px ${p.color}50` }} />
              <span style={{ fontSize: 11, color: p.color, fontFamily: C.mono }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Overall progress */}
      <div style={{ ...panelStyle({ padding: '14px 18px', marginBottom: 20 }) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: C.textMid }}>Overall progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, fontFamily: C.mono }}>{totalDone}/{totalTotal} tasks — {pct}%</span>
        </div>
        <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', borderRadius: 999, height: 5, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ height: '100%', borderRadius: 999, transition: 'width 0.5s ease', background: `linear-gradient(90deg, ${C.gold}, #F0C96A)`, width: `${pct}%` }} />
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {PEOPLE.map(p => {
            const allTasks = PLAN.flatMap(d => (d.tasks[p.key] || []).map((_, i) => taskKey(d.day, p.key, i)))
            const doneTasks = allTasks.filter(k => checked[k]).length
            return (
              <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color }} />
                <span style={{ fontSize: 11, color: p.color, fontFamily: C.mono }}>{p.label}: {doneTasks}/{allTasks.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Today banner */}
      {todayDay && (
        <div
          style={{ background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.28)', borderRadius: 10, padding: '12px 16px', marginBottom: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          onClick={() => setExpandedDay(expandedDay === todayDay ? null : todayDay)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, boxShadow: `0 0 6px ${C.gold}`, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>Today</span>
            <span style={{ fontSize: 12, color: C.textMid }}>— {PLAN.find(d => d.day === todayDay)?.focus}</span>
          </div>
          <span style={{ fontSize: 11, color: `${C.gold}80`, fontFamily: C.mono }}>{dayProgress(todayDay).done}/{dayProgress(todayDay).total} done</span>
        </div>
      )}

      {[
        { label: 'WEEK 1 — FIX THE PIPELINE, SEND FIRST WORKING MESSAGES', days: week1 },
        { label: 'WEEK 2 — CLOSE THE FIRST SALE, ALL 25 BOTTLENECKS FIXED', days: week2 },
      ].map(week => (
        <div key={week.label} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 1, background: C.borderDim }} />
            <span style={lbl({ color: C.textDim })}>{week.label}</span>
            <div style={{ flex: 1, height: 1, background: C.borderDim }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {week.days.map(day => {
              const { done, total } = dayProgress(day.day)
              const isToday = day.day === todayDay
              const isExpanded = expandedDay === day.day
              const isPast = todayDay && day.day < todayDay
              const isComplete = isPast && done === total && total > 0
              const hasBN = day.bottlenecks && day.bottlenecks.length > 0

              return (
                <div key={day.day} style={{ background: isToday ? 'rgba(212,168,67,0.04)' : isComplete ? 'rgba(0,255,136,0.03)' : C.panel, border: `1px solid ${isToday ? 'rgba(212,168,67,0.28)' : isComplete ? 'rgba(0,255,136,0.18)' : C.border}`, borderRadius: 10, overflow: 'hidden', transition: 'all 0.15s ease' }}>
                  <button
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setExpandedDay(isExpanded ? null : day.day)}
                  >
                    <span style={{ fontSize: 11, fontWeight: 800, width: 22, textAlign: 'center', color: isToday ? C.gold : isPast ? C.textDim : C.textMid, fontFamily: C.mono }}>{day.day}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: isToday ? C.gold : isPast ? C.textMid : C.text }}>{day.label}</span>
                        {isToday && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: C.gold, color: '#000', letterSpacing: '0.08em' }}>TODAY</span>}
                        {isComplete && <span style={{ fontSize: 10, color: C.green }}>✓</span>}
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: hasBN ? 3 : 0 }}>{day.focus}</div>
                      {hasBN && (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {day.bottlenecks.slice(0, 3).map((bn, i) => (
                            <span key={i} style={{ fontSize: 8, fontFamily: C.mono, color: C.cyan, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.15)', borderRadius: 4, padding: '1px 5px' }}>{bn}</span>
                          ))}
                          {day.bottlenecks.length > 3 && <span style={{ fontSize: 8, fontFamily: C.mono, color: C.textDim }}>+{day.bottlenecks.length - 3}</span>}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {total > 0 && <span style={{ fontSize: 11, fontFamily: C.mono, color: done === total ? C.green : C.textDim }}>{done}/{total}</span>}
                      {total > 0 && (
                        <div style={{ width: 42, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 99, background: isToday ? `linear-gradient(90deg, ${C.gold}, #F0C96A)` : isComplete ? C.green : `linear-gradient(90deg, ${C.cyan}, ${C.blue})`, width: `${total > 0 ? (done / total) * 100 : 0}%`, transition: 'width 0.4s ease' }} />
                        </div>
                      )}
                      <span style={{ fontSize: 9, color: C.textDim }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{ padding: '4px 16px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                      {PEOPLE.map(person => {
                        const tasks = day.tasks[person.key] || []
                        if (!tasks.length) return null
                        return (
                          <div key={person.key} style={{ background: person.panelBg, border: `1px solid ${person.panelBorder}`, borderRadius: 9, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: person.color, boxShadow: `0 0 5px ${person.color}60` }} />
                              <span style={{ ...lbl({ color: person.color, fontSize: 8 }) }}>{person.label}</span>
                            </div>
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {tasks.map((task, idx) => {
                                const key = taskKey(day.day, person.key, idx)
                                const done = checked[key]
                                return (
                                  <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }} onClick={() => toggle(day.day, person.key, idx)}>
                                    <div style={{ marginTop: 2, width: 14, height: 14, flexShrink: 0, borderRadius: 4, border: `1px solid ${done ? person.color : 'rgba(255,255,255,0.2)'}`, background: done ? person.panelBg : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s ease', boxShadow: done ? `0 0 5px ${person.color}40` : 'none' }}>
                                      {done && <span style={{ fontSize: 8, color: person.color, fontWeight: 900 }}>✓</span>}
                                    </div>
                                    <span style={{ fontSize: 11.5, lineHeight: 1.55, color: done ? C.textDim : C.textMid, textDecoration: done ? 'line-through' : 'none', transition: 'all 0.15s ease' }}>{task}</span>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
