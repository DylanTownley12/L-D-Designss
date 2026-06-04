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
    focus: 'Fix broken previews + activate Stripe — the two biggest revenue blockers',
    bottlenecks: ['#1 broken preview URLs', '#5 Stripe webhook', '#6 Stripe success URL', '#2 API keys'],
    tasks: {
      dylan: [
        'Railway → set PREVIEW_BASE_URL=https://l-d-designss-production.up.railway.app (fixes 707 broken preview links — do this first, everything depends on it)',
        'Railway → set REQUIRE_APPROVAL=false (unlocks email auto-send)',
        'Railway → set ANTHROPIC_API_KEY (unlocks agent chat + Claude 10am analysis)',
        'Railway → set GOOGLE_PLACES_API_KEY (get free key from console.cloud.google.com → enables Places API → fixes enricher)',
        'Go to stripe.com → create account (10 min) → copy STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET → add both to Railway',
        'In Stripe Dashboard → Webhooks → Add endpoint: https://l-d-designss-production.up.railway.app/api/webhooks/stripe → select checkout.session.completed',
      ],
      friend: [
        'Find 20 UK barbers on Instagram that have no website link in their bio — note their handle and city. These are your DM targets for the next 2 days.',
        'Send 10 personalised Instagram DMs today. Mention something specific from their profile — name, a photo they posted, their location. Do NOT use a template word for word.',
      ],
      claude: [
        'Run fix-preview-urls: POST /api/agents/admin/fix-preview-urls — fixes all 707 broken localhost preview links in one call',
        'Build Stripe success page (book.html on GitHub Pages) — "Sorted! Dylan will WhatsApp you within the hour."',
        'Add "Send Payment Link" button to lead detail panel on the dashboard',
        'Update Baz AGENTS.md: when barber says yes or asks how to pay → auto-send Stripe checkout link',
      ],
      openclaw: [
        'Hold the 9am batch today — wait for Dylan to confirm previews are fixed first',
        'Once Dylan confirms, queue is ready to go tomorrow morning',
        'Monitor all inbound messages — alert Dylan immediately on any warm signal',
      ],
    },
  },
  {
    day: 2, date: '2026-06-05', label: 'Thu 5 Jun', week: 1,
    focus: 'First batch with working links — fix follow-up channel + quality ordering',
    bottlenecks: ['#9 follow-up channel bug', '#13 quality ordering', '#14 WA campaign 30→10', '#24 Stripe idempotency'],
    tasks: {
      dylan: [
        'At 9:30am: open dashboard → check agent feed → confirm 10 messages sent with no red errors. If errors, screenshot and tell Claude.',
        'Check WhatsApp: any barber replied? If yes — reply yourself immediately. Do not wait for Baz.',
        'Click your own Stripe payment link to confirm it loads before you send it to anyone.',
      ],
      friend: [
        'Send 10 Instagram DMs — different city from yesterday. Keep notes on which type of profile tends to reply.',
        'Reply to any responses from yesterday\'s DMs personally.',
      ],
      claude: [
        'Fix #9: follow-up sequences now use the same channel as the initial outreach (WA leads get WA follow-ups, not email)',
        'Fix #13: generate_whatsapp_campaign() now orders leads by quality_score DESC so best targets get messaged first',
        'Fix #14: change scheduler whatsapp_campaign limit from 30 to 10 — queue stays clean, no stale pile-up',
        'Fix #24: Stripe webhook idempotency guard — check lead not already converted before processing duplicate events',
      ],
      openclaw: [
        '9am: first proper batch of 10 WhatsApp messages with working preview links, 5-7 min gaps',
        'Auto-reply to every inbound message using the playbook',
        'Alert Dylan within 60 seconds if any barber shows interest or asks about price',
      ],
    },
  },
  {
    day: 3, date: '2026-06-06', label: 'Fri 6 Jun', week: 1,
    focus: 'Email channel live — detect replies + stop double-contacting leads',
    bottlenecks: ['#4 email reply detection', '#20 multi-channel dedup'],
    tasks: {
      dylan: [
        'Check enricher stats: open agent logs → find lead_enricher → how many emails did it find overnight? Tell Claude the number.',
        'Check the 8am CEO briefing email — is it showing correct pipeline numbers?',
        'Reply personally to any warm lead from the first 2 days.',
      ],
      friend: [
        'Send 10 Instagram DMs — new city.',
        'Go back to yesterday\'s list: any of those barbers have posted since? Reply to their stories if relevant — warms them up before a DM.',
      ],
      claude: [
        'Fix #4: add Gmail reply polling — scheduler job every 15 mins that checks Gmail inbox, matches replies to leads by email, fires notify_reply_received automatically',
        'Fix #20: add multi-channel dedup guard — before generating any outreach, check if lead already has a sent/queued message in any channel. Skip if yes.',
      ],
      openclaw: [
        '9am batch 2 of 10 WhatsApp messages',
        'Email queue now processing every 30 mins (REQUIRE_APPROVAL=false)',
        'Enricher ran at 6:05am — contacts being found and saved',
      ],
    },
  },
  {
    day: 4, date: '2026-06-07', label: 'Sat 7 Jun', week: 1,
    focus: 'Instagram DMs surfaced + sales agent drafts reviewable on dashboard',
    bottlenecks: ['#8 Instagram DMs never sent', '#10 sales agent drafts ignored'],
    tasks: {
      dylan: [
        'Open Outreach page → Instagram DMs section → copy 5 and send them manually from your Instagram account. These are leads the system found but can\'t send to automatically yet.',
        'Open Outreach page → Pending Approvals section → review sales agent drafts for any "interested" leads → approve the ones that sound right.',
        'Saturday check: read CEO briefing, scan Baz alerts. If anyone is warm — reply yourself today.',
      ],
      friend: [
        'Send 5 Instagram DMs (lighter Saturday). Reply to any responses.',
        'Look at the barbers who didn\'t reply to your DMs this week — is there a pattern? Too salesy? Wrong type of barber? Tell Dylan on Monday.',
      ],
      claude: [
        'Fix #8: add Instagram DMs section to Outreach page — shows queued Instagram messages with one-click Copy button so Dylan can paste and send manually',
        'Fix #10: add Pending Approvals section to Outreach page — shows sales agent drafts for interested leads with approve / edit / send buttons',
      ],
      openclaw: [
        'Weekend quiet mode — monitoring inbound only',
        'No proactive outreach today',
        'Alert Dylan if any hot lead messages',
      ],
    },
  },
  {
    day: 5, date: '2026-06-08', label: 'Sun 8 Jun', week: 1,
    focus: 'Rest — systems run themselves, Dylan responds to anything hot',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Morning and evening check — 10 mins each. Read CEO briefing, scan Baz alerts.',
        'If any barber has replied or asked about payment — respond immediately yourself.',
        'Think about this: what\'s the most common thing barbers say? Tell Claude on Monday so I can rewrite the opener around it.',
      ],
      friend: [
        'Day off.',
      ],
      claude: [
        'Nothing — automated systems run themselves today.',
      ],
      openclaw: [
        'Quiet monitoring only — no proactive outreach',
        'Follow-up sequences running in background',
      ],
    },
  },
  {
    day: 6, date: '2026-06-09', label: 'Mon 9 Jun', week: 2,
    focus: 'Conversation threads on dashboard + status race condition fixed',
    bottlenecks: ['#12 no conversation thread', '#23 lead status race condition'],
    tasks: {
      dylan: [
        'Tell Claude: what\'s the most common objection you\'ve heard this week? One sentence. I\'ll rewrite the opener around it.',
        'Open the lead detail for your 3 warmest leads — use the new conversation thread to see exactly what Baz said and what they replied. Then message them yourself with a proper response.',
        'Write down your Week 1 numbers: total sent, total replies, reply rate %. Real numbers only.',
      ],
      friend: [
        'Send 10 Instagram DMs — different city.',
        'Report back: what are barbers actually saying when they do respond? Note the exact words.',
      ],
      claude: [
        'Fix #12: add conversation thread panel to lead detail view — all outreach_messages for the lead, chronological, colour-coded inbound/outbound so Dylan can see exactly what was said',
        'Fix #23: add status freshness guard in generate_whatsapp_campaign — re-fetch lead status inside loop before generating, skip if status changed since batch started',
        'Rewrite weakest A/B opener variant based on Dylan\'s objection feedback',
      ],
      openclaw: [
        '9am batch continues',
        'Week 1 follow-up sequences active for all leads sent last week',
        '8am: week 1 stats summary emailed to Dylan',
      ],
    },
  },
  {
    day: 7, date: '2026-06-10', label: 'Tue 10 Jun', week: 2,
    focus: 'Switch AI provider + fix phone deduplication',
    bottlenecks: ['#11 OpenAI → Anthropic', '#16 phone dedup'],
    tasks: {
      dylan: [
        'Message your 3 warmest leads personally today — specific to their last message. Push for a yes or a no. "A maybe just wastes both our time."',
        'Check email replies: did the Gmail polling pick anything up? Anything in your inbox from barbers?',
      ],
      friend: [
        'Send 10 Instagram DMs.',
        'Pick your 2 warmest DM conversations and push them harder today — offer to send a preview link if they seem interested.',
      ],
      claude: [
        'Fix #11: switch outreach_writer from OpenAI GPT-4o-mini to Claude Haiku 4.5 — same quality, half the cost, one API key instead of two',
        'Fix #16: add phone number deduplication to lead_finder — prevents the same barber being added twice with different name spellings',
      ],
      openclaw: [
        '9am batch with updated opener variant',
        'Email queue processing — second week of emails going out',
      ],
    },
  },
  {
    day: 8, date: '2026-06-11', label: 'Wed 11 Jun', week: 2,
    focus: 'Day 30 follow-up + preview refresher URL validation',
    bottlenecks: ['#21 Day 30 follow-up missing', '#22 preview refresher sends broken links'],
    tasks: {
      dylan: [
        'Send Stripe payment link to your single warmest lead today. Keep it simple: "Ready when you are — here\'s the link: [link]. Just the £75 deposit to get started."',
        'Check if any email replies came in overnight — reply personally to all of them.',
      ],
      friend: [
        'Send 10 Instagram DMs.',
        'Go back through your DM list — anyone who saw your message but didn\'t reply? Send a follow-up: "Did you get a chance to have a look?"',
      ],
      claude: [
        'Fix #21: add Day 30 follow-up step to sequences — different tone, includes a free first month offer for leads that have gone completely cold',
        'Fix #22: preview refresher now validates the new URL returns HTTP 200 before queuing the follow-up message — no more sending broken links',
      ],
      openclaw: [
        '9am batch continues',
        'Day 3 follow-ups now triggering for leads from last week',
        'Email queue processing',
      ],
    },
  },
  {
    day: 9, date: '2026-06-12', label: 'Thu 12 Jun', week: 2,
    focus: 'CEO agent crash fix + WhatsApp delivery tracking',
    bottlenecks: ['#15 CEO subprocess crashes Railway', '#18 WA delivery failures show as sent'],
    tasks: {
      dylan: [
        'Check Stripe: any deposits in? If yes — WhatsApp the barber yourself within 10 minutes confirming you\'ve seen it and you\'re starting.',
        'Go through every open warm thread — reply to each one. Push for a yes or a no.',
      ],
      friend: [
        'Send 10 Instagram DMs.',
        'Your best performing DM so far — what was different about it? Tell Dylan.',
      ],
      claude: [
        'Fix #15: wrap CEO agent retries in FastAPI BackgroundTasks — retried agents no longer run synchronously in the CEO check, can\'t crash Railway',
        'Fix #18: add delivery_status field to outreach_messages — Baz reports actual delivery vs just sent, phantom "sent" leads get flagged',
      ],
      openclaw: [
        '9am batch',
        'Day 7 follow-ups triggering for leads from Week 1',
      ],
    },
  },
  {
    day: 10, date: '2026-06-13', label: 'Fri 13 Jun', week: 2,
    focus: 'Friday closing push — fix agent uptime display',
    bottlenecks: ['#25 agent uptime shows 15% (wrong)', '#19 Gmail SMTP deliverability (document)'],
    tasks: {
      dylan: [
        'Friday closing push: message your warmest lead with a genuine offer — "Happy to drop the first month free if you want to get started this week."',
        'Check the Outreach page Pending Approvals — any drafts to approve?',
        'Check Stripe: any payments came in this week?',
      ],
      friend: [
        'Send 10 Instagram DMs.',
        'Your warmest DM lead — push for a decision today. "Are you still interested? Happy to send you a preview of what your site could look like."',
      ],
      claude: [
        'Fix #25: separate scheduled vs crashed agents in the uptime display — scheduled agents show "ON SCHEDULE" not "OFFLINE". Only truly failed agents show as down.',
        'Document #19: write up the Resend migration plan (better email deliverability) — ready to implement post-£1k/month',
      ],
      openclaw: [
        'Friday batch + Friday follow-ups sent to leads 72h+ silent',
        'Weekend quiet mode starts tonight',
      ],
    },
  },
  {
    day: 11, date: '2026-06-14', label: 'Sat 14 Jun', week: 2,
    focus: 'Saturday — check alerts, close anyone who surfaces',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Morning check — 10 minutes. Read CEO briefing, scan Baz alerts.',
        'If anyone replies asking about payment — respond immediately yourself.',
      ],
      friend: [
        'Send 5 Instagram DMs. Reply to anything warm.',
      ],
      claude: [
        'Nothing — all fixes from this week are live.',
      ],
      openclaw: [
        'Quiet monitoring — inbound only',
        'No proactive outreach today',
      ],
    },
  },
  {
    day: 12, date: '2026-06-15', label: 'Sun 15 Jun', week: 2,
    focus: 'Rest — think about what to change for Week 3',
    bottlenecks: [],
    tasks: {
      dylan: [
        'Reply to anything warm from the weekend.',
        'Think: more volume? Better messaging? Different cities? Tell Claude tomorrow — that becomes the Week 3 plan.',
      ],
      friend: [
        'Day off.',
      ],
      claude: [
        'Sunday health check — verify all cron jobs ran correctly this week.',
      ],
      openclaw: [
        'Quiet mode — monitoring only',
      ],
    },
  },
  {
    day: 13, date: '2026-06-16', label: 'Mon 16 Jun', week: 2,
    focus: 'Surface research insights + final closing push',
    bottlenecks: ['#17 research/CMO insights never surfaced'],
    tasks: {
      dylan: [
        'Go through EVERY warm thread you have. Message each one personally today. Push for a yes or a no. By end of today, every open conversation should have a clear next step.',
        'Tell Claude your Week 3 direction in one sentence — more volume, different city, better closer, or something else.',
      ],
      friend: [
        'Send 10 Instagram DMs.',
        'Pick your 3 warmest DM leads — push them to a decision today. Offer to send a preview: "Happy to build you a free preview to have a look at?"',
      ],
      claude: [
        'Fix #17: surface research agent + CMO insights on the Strategy page — shows top 3 cities by reply rate, auto-biases tomorrow\'s lead_finder to target those cities first',
        'Draft Week 3 plan based on Dylan\'s direction input',
      ],
      openclaw: [
        '9am batch continues',
        'Day 14 follow-ups triggering for leads from Week 1 — final automated touch',
        '8am: full 2-week stats summary emailed to Dylan',
      ],
    },
  },
  {
    day: 14, date: '2026-06-17', label: 'Tue 17 Jun', week: 2,
    focus: '2-week review — all 25 bottlenecks fixed, first sale target',
    bottlenecks: ['ALL 25 BOTTLENECKS ADDRESSED'],
    tasks: {
      dylan: [
        'Write down your real 2-week numbers: total sent (WA + email), total replies, reply rate %, deposits received, revenue. Real numbers only — no estimates.',
        'Message all remaining warm leads one final time — personal, short, honest. "Still thinking about it? No pressure, just want to know either way."',
        'Tell me one thing that worked and one that didn\'t — that\'s the only input I need to build Week 3.',
      ],
      friend: [
        'Final push: contact every warm DM lead today. "Last chance to claim your free preview before I move on to other barbers in [city]."',
        'Write down: how many DMs sent total, how many replied, how many showed real interest.',
      ],
      claude: [
        'Full 2-week performance report: all 25 bottlenecks — fixed vs outstanding, reply rate trend, conversion rate, revenue in',
        'Week 3 plan built from real data — ready to share with Dylan immediately',
        'Update HANDOFF.md: mark completed bottleneck items as done',
      ],
      openclaw: [
        '9am batch — Week 3 openers starting',
        '2-week summary emailed to Dylan at 8am with full stats',
        'All systems running into Week 3 without interruption',
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
