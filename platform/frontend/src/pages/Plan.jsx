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

const PLAN = [
  {
    day: 1, date: '2026-06-04', label: 'Wed 4 Jun', week: 1,
    focus: 'Foundation day — Baz connected, previews fixed, Stripe live',
    bottlenecks: ['Baz disconnected', 'Preview URLs broken', 'Stripe in test mode'],
    tasks: {
      dylan: [
        '✅ Baz reconnected and sending',
        '✅ Preview URL fix ran',
        'Switch Stripe to LIVE mode: stripe.com → Developers → API Keys → toggle to Live → copy new STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET → paste both into Railway Variables',
      ],
      friend: [],
      claude: [
        '✅ WA cap fixed to 10/day',
        '✅ 286 drafts promoted to queued',
        '✅ Preview CTA bug fixed (was pointing to barber\'s own number)',
      ],
      openclaw: [
        '✅ Baz back online and connected',
        'Monitor inbound — alert Dylan immediately on any warm signal',
      ],
    },
  },
  {
    day: 2, date: '2026-06-05', label: 'Thu 5 Jun', week: 1,
    focus: 'Fix the Instagram page — it\'s killing your credibility before you even speak',
    bottlenecks: ['Instagram page looks fake — 1 follower, no posts', 'WA logged out this morning (now fixed)', 'Invalid numbers marked as sent'],
    tasks: {
      dylan: [
        'Fix Instagram bio RIGHT NOW — 3 lines: "Building websites for UK barbers 🇬🇧 / Free preview built for your shop / 👇 See what yours looks like" + your link',
        'Change profile picture to your actual face — not a logo, not a graphic. YOUR face. People buy from people.',
        'Post 9 pieces of content today to fill the grid — 3 before/after screenshots (Google listing with no website vs your preview), 2 more preview screenshots, 2 barber tip posts ("why barbers lose customers without a website"), 1 post about who you are, 1 best reply you\'ve had',
        'Record one 30-second Reel — your face, screen record the preview tool, say "I build websites for barbers, here\'s what one looks like." One take. Post it.',
        'Reply to every warm WA lead personally today — same day, every time. Don\'t leave Baz to close them.',
      ],
      friend: [
        'Go to the dashboard → Outreach page → Instagram tab',
        'Send 20 Instagram DMs today using the queue — click "Find on Google →" to find each barber\'s profile, copy the script, DM them, mark sent',
        'Spread them out: 5 DMs at 9am, 5 at 11am, 5 at 1pm, 5 at 3pm — don\'t blast all 20 at once or Instagram will flag you',
        'Screenshot every reply and send it to Dylan immediately — every single one',
      ],
      claude: [
        '✅ WA watchdog built — alerts Dylan within 3 mins if Baz goes down',
        '✅ DNS fix applied — prevents the dropout that caused the logout',
        '✅ Instagram card fixed — copy + mark sent split, Google search button added',
        '✅ 64 Instagram scripts reset from failed → queued',
        '✅ Enricher fixed to read existing website field for Instagram handles',
        '✅ 60+ UK cities added to lead finder',
        '✅ Send script fixed — now requires messageId confirmation, filters landlines',
      ],
      openclaw: [
        '9am batch — 10 WA messages going out with 5-7 min gaps',
        'Auto-reply all inbound using AGENTS.md playbook',
        'Alert Dylan within 60 seconds if any barber shows interest or asks about price',
        'Auto-send Stripe link if barber reacts positively to their preview',
      ],
    },
  },
  {
    day: 3, date: '2026-06-06', label: 'Fri 6 Jun', week: 1,
    focus: 'Volume day — WA + 20 Instagram DMs + reply to every warm thread',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Read 8am briefing — note your real numbers: WA sent, replies, reply rate. Write them down.',
        'Reply personally to every warm WA thread from this week — push each one to a yes or a no. No maybes.',
        'Send Stripe link to ANYONE who asked about price or said yes: "Just £75 to kick it off — here\'s the link: [link]." Send it today.',
        'Message the 2 warm Instagram leads from last week who said "go on" — manually, from your Instagram, right now.',
      ],
      friend: [
        'Send 20 DMs — different city from yesterday',
        'Follow up every DM from Day 2 that didn\'t reply: "Hey, just checking you got my message about your website?" — one follow-up, that\'s it',
        'For any thread with 2+ messages exchanged: send a voice note instead of text. Under 30 seconds. Mention their shop name. Voice notes get opened 3x more.',
        'Write down the most common reply you\'re getting — exact words. This is gold.',
      ],
      claude: [
        'Rewrite the weakest WA opener variant based on any objection feedback Dylan reports',
        'Add conversation thread to lead detail page — all messages in one timeline, colour-coded inbound/outbound',
      ],
      openclaw: [
        '9am batch — Day 3',
        'Day 1 follow-up sequences triggering for leads that went quiet',
      ],
    },
  },
  {
    day: 4, date: '2026-06-07', label: 'Sat 7 Jun', week: 1,
    focus: 'Saturday — lighter day, close any threads that are sitting warm',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Check Baz alerts from overnight — reply to anything warm immediately',
        'Go through every open warm thread — push each to a yes or a no. "Still up for it? Happy to tweak anything on the preview."',
        'Spend 30 mins on Instagram — post one more Reel if you haven\'t already, reply to any comments or DMs',
      ],
      friend: [
        'Send 10 DMs — lighter Saturday',
        'Go through all your DM threads from this week — for any with 2+ messages, push them: "Want me to show you what your site could look like? Already built a free preview."',
        'Report to Dylan: how many DMs sent total? How many replied? What\'s the most common thing they say?',
      ],
      claude: [
        'Scan all 113 original outreach_sent leads for inbound replies — surface any re-engage opportunities on dashboard',
        'A/B analysis: which WA opener has the best reply rate so far? Kill the weakest, write a replacement.',
      ],
      openclaw: [
        'Weekend quiet mode — monitoring inbound only, no proactive sends',
        'Alert Dylan immediately if any hot lead messages in',
      ],
    },
  },
  {
    day: 5, date: '2026-06-08', label: 'Sun 8 Jun', week: 1,
    focus: 'Rest — system runs itself, you think about what\'s working',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Morning check only — 10 minutes. Reply to anything warm.',
        'Think: what\'s the most common thing barbers say back? Tell me tomorrow and I\'ll rewrite the opener around the real objection.',
      ],
      friend: [
        'Find 20 barbers for Monday\'s DM batch — save their Instagram handles in a note',
        'Reply to any weekend DMs that come in',
      ],
      claude: [
        'Automated systems run themselves — enricher, lead finder, follow-up sequences all running',
      ],
      openclaw: [
        'Quiet monitoring only — follow-up sequences running in background',
      ],
    },
  },
  {
    day: 6, date: '2026-06-09', label: 'Mon 9 Jun', week: 2,
    focus: 'Week 2 starts — chase a testimonial, rewrite opener from real data',
    bottlenecks: ['No testimonial yet — kills trust on Instagram', 'Opener not tested on real objections yet'],
    tasks: {
      dylan: [
        'Tell me the most common objection barbers are giving — one sentence. I\'ll rewrite the opener today.',
        'Chase a testimonial: message every barber who engaged but didn\'t buy — "Happy to build your site completely free in exchange for an honest review and one referral." One yes = closes the next 10 sales.',
        'Write down real Week 1 numbers: WA sends, replies, reply rate %, deposits, revenue. No estimates. Bring them here.',
        'Open your 3 warmest WA threads — reply personally to each one, reference their last message.',
      ],
      friend: [
        'Send 20 DMs — new city',
        'Report exact Week 1 numbers: how many DMs sent, how many replied, what did they actually say',
        'Your warmest DM thread — push to a decision today: "Want me to show you the free preview I built for your shop?"',
      ],
      claude: [
        'Rewrite weakest opener based on Dylan\'s objection data',
        'Surface "warm but not yet decided" leads — leads that replied positively but haven\'t got a Stripe link yet',
      ],
      openclaw: [
        '9am batch with updated opener variant',
        'Week 1 follow-up sequences active for all last week\'s leads',
        '8am: Week 1 stats in morning briefing',
      ],
    },
  },
  {
    day: 7, date: '2026-06-10', label: 'Tue 10 Jun', week: 2,
    focus: 'Offer improvement day — make it so good saying no feels stupid',
    bottlenecks: ['Offer is plain — no risk reversal, no guarantee'],
    tasks: {
      dylan: [
        'Add a guarantee to your pitch: "If you don\'t get more enquiries in 30 days, I\'ll refund every penny." Send this version to your next 3 warm leads and see if it changes the conversation.',
        'Message your 3 warmest WA leads personally — push for a yes or a no. "A maybe wastes both our time."',
        'Send Stripe link to every interested lead that hasn\'t paid. Don\'t overthink it — just send it.',
      ],
      friend: [
        'Send 20 DMs',
        'Try this opener today instead of the default: "I built a free preview for your shop — want to see it?" — lead with the offer, not the pitch. Report which gets more replies.',
        'Voice note your 3 hottest leads — casual, under 30 seconds, mention their shop name. Voice notes get way more responses than text.',
      ],
      claude: [
        'Draft closing messages for every lead with status "replied" or "interested" — personalised, one-click send from dashboard',
        'Add Day 30 follow-up step to sequences — different tone, cold-lead revival message',
      ],
      openclaw: [
        '9am batch',
        'Day 3 follow-ups triggering for Week 1 leads',
      ],
    },
  },
  {
    day: 8, date: '2026-06-11', label: 'Wed 11 Jun', week: 2,
    focus: 'Send the first Stripe link to a warm lead — today, not tomorrow',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Send the Stripe payment link to your single warmest lead today. Not tomorrow. "Ready when you are — just £75 to kick it off: [link]. Once that\'s in I\'ll crack on, usually takes a week."',
        'If you have a testimonial by now — post it on Instagram immediately. Pin it. Add it to your WA messages.',
        'Check every "interested" lead — if no Stripe link sent yet, send one today.',
      ],
      friend: [
        'Send 20 DMs',
        'Follow up every DM lead that hasn\'t replied in 48h — one message: "Did you get a chance to see my message?"',
        'Your warmest lead — if they haven\'t seen the preview yet: "I\'ve already built a free one for your shop, want me to send it over?"',
      ],
      claude: [
        'City performance report — which UK cities have the best reply rate so far? Auto-bias tomorrow\'s WA batch toward the top 3 cities.',
        'Preview URL validator — check all queued follow-up messages have working preview links before they send',
      ],
      openclaw: [
        '9am batch',
        'Day 7 follow-ups triggering for all Week 1 leads',
      ],
    },
  },
  {
    day: 9, date: '2026-06-12', label: 'Thu 12 Jun', week: 2,
    focus: 'Check Stripe — if a deposit landed, reply in 10 minutes or less',
    bottlenecks: [],
    tasks: {
      dylan: [
        'CHECK STRIPE FIRST THING. Any deposit in? If yes — WhatsApp them within 10 minutes: "Sorted! I\'ll get started — just send me your opening hours and any photos of the shop."',
        'Go through every open warm thread — reply to each. Push for a yes or a no. Nothing stays unanswered.',
        'Re-engage 5 leads that never replied to the first WA — completely different angle: "Wanted to show you what I built for a barber in [nearby city] — thought yours could look similar."',
      ],
      friend: [
        'Send 20 DMs',
        'What\'s your best performing opener? Tell Dylan — double down on it.',
        'For your warmest DM lead: check their bio for a phone number. If it\'s there, WhatsApp them directly — higher conversion rate than Instagram DM.',
      ],
      claude: [
        'Pull 10 highest quality_score leads not yet contacted — write personalised re-engagement messages with a completely different angle, queue for tomorrow\'s WA batch',
        'Analyse all inbound replies by intent — group into: interested, objection, wrong number. Surface the "warm but not yet decided" ones for Dylan to personally message',
      ],
      openclaw: [
        '9am batch',
        'Day 7 follow-ups for Week 2 leads now triggering',
      ],
    },
  },
  {
    day: 10, date: '2026-06-13', label: 'Fri 13 Jun', week: 2,
    focus: 'Friday close — get that first £75 deposit before the weekend',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Friday push: message your single warmest lead with a real close — "Happy to drop the deposit to £50 if you want to lock it in this week." Get a yes or a no by end of day.',
        'Write down mid-point numbers: WA sends, Instagram DMs, replies, interested leads, deposits, revenue.',
        'Send Stripe link to every warm lead who hasn\'t got one yet. Not next week — today.',
      ],
      friend: [
        'Send 20 DMs',
        'Your warmest DM lead — be direct: "Are you still up for it? I\'ve got a slot open this week."',
        'Voice note your 3 hottest leads — short, real, mention their shop name. No script.',
      ],
      claude: [
        'Draft 5 personalised re-engagement messages for the 5 highest quality_score leads that never replied — ready for Dylan to send manually this weekend',
        'Update WA templates based on what\'s working — retire any variant with 0 replies',
      ],
      openclaw: [
        'Friday batch + 72h follow-ups for leads that went silent',
        'Weekend quiet mode starts tonight',
      ],
    },
  },
  {
    day: 11, date: '2026-06-14', label: 'Sat 14 Jun', week: 2,
    focus: 'Anyone who surfaces today gets a response in under 10 minutes',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Morning check — 10 minutes. CEO briefing, Baz alerts, overnight replies.',
        'Anyone who messages about payment today: respond within 10 minutes. No exceptions.',
        'Post something on Instagram — even one story showing a preview you built this week.',
      ],
      friend: [
        'Send 10 DMs (lighter Saturday)',
        'Go through all warm DM threads from this week — follow up anyone who went quiet after 2+ messages',
        'Report this week\'s numbers to Dylan: DMs sent, replied, showed real interest',
      ],
      claude: [
        'Nothing new — all fixes live, automated systems running',
      ],
      openclaw: [
        'Quiet monitoring — inbound only, no proactive outreach',
      ],
    },
  },
  {
    day: 12, date: '2026-06-15', label: 'Sun 15 Jun', week: 2,
    focus: 'Rest — but reply to anything warm',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Reply to anything warm from the weekend — same day, every time.',
        'Think: is it the volume, the offer, the opener, or the page that\'s the bottleneck right now? Tell me tomorrow.',
      ],
      friend: [
        'Find 20 barbers for Monday\'s DM batch',
        'Reply to any weekend DMs',
      ],
      claude: [
        'Sunday health check — verify all crons ran correctly this week, flag any silent failures',
      ],
      openclaw: [
        'Quiet mode — monitoring only',
      ],
    },
  },
  {
    day: 13, date: '2026-06-16', label: 'Mon 16 Jun', week: 2,
    focus: 'Close every open thread — by end of today every conversation is a yes, no, or clear next step',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Message EVERY open warm thread today — personal, specific, push for a yes or a no. Nothing gets left open.',
        'Tell me your Week 3 direction: more volume, different cities, better closing message, or something else entirely.',
        'If still no sale: offer one barber a completely free site in exchange for a Google review, a photo testimonial, and one referral. This is your social proof unlock — one yes here closes the next 10 sales.',
      ],
      friend: [
        'Send 20 DMs — bigger Monday push',
        'WhatsApp call your 2 warmest DM leads. 2 minutes each. A live call closes better than any text.',
        'Find 20 new barbers for tomorrow\'s batch',
      ],
      claude: [
        'Surface top 3 cities by reply rate — auto-bias lead finder and tomorrow\'s WA batch toward those cities',
        'Draft Week 3 plan based on Dylan\'s direction',
      ],
      openclaw: [
        '9am batch continues',
        'Day 14 follow-ups triggering for Week 1 leads — final automated touch',
        '8am: full 2-week stats in morning briefing',
      ],
    },
  },
  {
    day: 14, date: '2026-06-17', label: 'Tue 17 Jun', week: 2,
    focus: '2-week review — count the money, plan Week 3',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Real numbers only: total WA sent, total IG DMs sent, total replies, reply rate %, Stripe links sent, deposits received, revenue. Write them down.',
        'Message every remaining warm lead one final time — honest, short: "Still thinking about it? No pressure — just want to know either way."',
        'If you have your first sale: celebrate for 10 minutes, then ask them for a referral.',
        'If you don\'t have a sale yet: you\'re not far. Tell me exactly where the conversations are dying — I\'ll fix it.',
      ],
      friend: [
        'Final push today: message every warm DM lead — "Last chance to grab your free preview before I move on to other barbers in [city]."',
        'Voice note your 3 hottest leads — short, real, mention their shop name',
        'Write down your 2-week totals and share with Dylan: DMs sent, replied, showed real interest',
      ],
      claude: [
        'Full 2-week report: sends/replies/conversion by channel, city, template — in the 8am briefing',
        'Week 3 plan ready immediately after Dylan\'s direction',
        'Update HANDOFF.md — mark everything completed, add outstanding items',
      ],
      openclaw: [
        '9am batch — Week 3 openers starting',
        '2-week stats summary in morning briefing',
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
          5–17 Jun 2026 · Volume + follow-up + offer · By Day 14: first sale closed or you'll be blown away by what's built
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
        { label: 'WEEK 1 — FIX THE PAGE, FLOOD THE CHANNELS, GET REPLIES', days: week1 },
        { label: 'WEEK 2 — CONVERT REPLIES INTO £75 DEPOSITS', days: week2 },
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
