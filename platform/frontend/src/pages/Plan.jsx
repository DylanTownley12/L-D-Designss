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
    focus: 'Activate everything — env vars, Stripe, Baz confirmed live',
    tasks: {
      you: [
        'Set REQUIRE_APPROVAL=false in Railway Variables — unlocks email auto-send. Takes 2 minutes.',
        'Get a free Google Places API key (console.cloud.google.com) and add GOOGLE_PLACES_API_KEY to Railway — fixes the enricher finding 0 contacts.',
        'Set up a Stripe account at stripe.com — free, takes 10 minutes. Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to Railway when done.',
        'Confirm Baz is live: send a WhatsApp from a different number and wait for an auto-reply within 60 seconds. If it doesn\'t reply, run: openclaw channels login --channel whatsapp',
      ],
      me: [
        'Build Stripe checkout endpoint + payment webhook in backend',
        'Add "Send Payment Link" button to the lead detail panel on the dashboard',
        'Update Baz AGENTS.md: when a barber says yes or asks how to pay → send Stripe link automatically',
        'Fix any CEO agent errors showing on the dashboard logs',
      ],
      openclaw: [
        'Online and monitoring all inbound messages',
        'Ready to send 9am batch the moment WhatsApp ban clears — 10 messages, 5-7 min gaps',
        'Alert Dylan immediately if anyone shows interest or asks about price',
      ],
    },
  },
  {
    day: 2, date: '2026-06-05', label: 'Thu 5 Jun', week: 1,
    focus: 'First batch confirmed — check the logs, reply to anything warm',
    tasks: {
      you: [
        'At 9:30am: open the dashboard and check the agent feed — were 10 messages sent? Any red errors? If errors, screenshot and tell me.',
        'Check your WhatsApp: did Baz get any replies? Anything that looks warm, reply to it yourself — don\'t leave it to Baz.',
        'Once Stripe is set up: click your own payment link and make sure it loads correctly before sending it to anyone.',
      ],
      me: [
        'Pull the 9am batch logs — confirm sends, count any errors, flag anything broken',
        'Check if GOOGLE_PLACES_API_KEY is working: how many leads now have phone numbers or emails vs yesterday?',
        'Surface the top 10 leads by quality score on the leads dashboard',
      ],
      openclaw: [
        '9am: first batch of 10 WhatsApp messages sent, 5-7 min gaps',
        'Auto-replying to every inbound message using the playbook',
        'Follow-up sequences queued for leads who don\'t reply within 48h',
      ],
    },
  },
  {
    day: 3, date: '2026-06-06', label: 'Fri 6 Jun', week: 1,
    focus: 'Email pipeline live — two channels running simultaneously',
    tasks: {
      you: [
        'Reply personally to any warm lead from the first 2 days — don\'t let Baz handle anything that\'s already warm.',
        'Check the 8am briefing email — does it show the right numbers? Reply rate, pipeline counts, WA queue depth.',
        'Go through your 5 highest-quality preview sites — would you pay £150 for one? If any look weak, tell me exactly what\'s wrong.',
      ],
      me: [
        'Verify email pipeline is sending: check outreach_messages table for queued + sent emails, report counts',
        'Generate 3 new opener variants based on the first 2 days of reply data',
        'If any preview sites Dylan flags look weak — fix the template and redeploy',
      ],
      openclaw: [
        '9am: batch 2 (10 messages)',
        'Email queue processing every 30 min — first emails going out today',
        'Day 1 follow-ups triggered for leads who haven\'t replied',
      ],
    },
  },
  {
    day: 4, date: '2026-06-07', label: 'Sat 7 Jun', week: 1,
    focus: 'Saturday — let the system work, you just respond to anything hot',
    tasks: {
      you: [
        'One check in the morning (10 mins): read the CEO briefing, scan Baz alerts, check for any replies.',
        'If anyone is interested or asks about price — reply yourself immediately. Don\'t wait.',
        'That\'s it. Don\'t send extra messages today — let the automated batches do their job.',
      ],
      me: [
        'Nothing unless something breaks — all systems automated today',
      ],
      openclaw: [
        'Quiet monitoring — responding to inbound only',
        'No proactive outreach on weekends',
        'Alert Dylan the moment any hot signal comes in',
      ],
    },
  },
  {
    day: 5, date: '2026-06-08', label: 'Sun 8 Jun', week: 1,
    focus: 'Sunday — rest, but think about the main objection you\'re hearing',
    tasks: {
      you: [
        'Morning and evening check — 5 mins each. Respond to anything warm personally.',
        'Think about this: what\'s the main thing barbers say when they don\'t want it? Price? Already got one? Not interested? Tell me Monday so I can rewrite the opener around it.',
      ],
      me: [
        'Sunday automated health check — verify all cron jobs fired correctly over the weekend',
        'Prep stats report for Monday morning briefing',
      ],
      openclaw: [
        'Quiet mode — monitoring only',
        'No proactive outreach today',
      ],
    },
  },
  {
    day: 6, date: '2026-06-09', label: 'Mon 9 Jun', week: 1,
    focus: 'Update opener based on real data — push warm leads to a decision',
    tasks: {
      you: [
        'Tell me the most common objection you\'ve seen so far. One sentence. I\'ll rewrite the opener around it today.',
        'Check the A/B stats panel — which opener variant has the best reply rate? Screenshot it.',
        'Go through every warm lead thread. Reply to each one personally today — push for a yes or a no. A maybe just wastes your time.',
      ],
      me: [
        'Rewrite the weakest A/B variant based on Dylan\'s objection feedback — deploy it today',
        'Full Week 1 stats: total sent, total replies, reply rate %, top city, best variant — clean summary',
        'Surface the 5 leads most likely to convert this week based on engagement signals',
      ],
      openclaw: [
        '9am: batch 3 with updated opener variants',
        'Week 1 follow-ups continuing on all sent leads',
        'Enricher running — building phone and email contacts from GOOGLE_PLACES_API_KEY',
      ],
    },
  },
  {
    day: 7, date: '2026-06-10', label: 'Tue 10 Jun', week: 1,
    focus: 'Week 1 review — write down every number cold',
    tasks: {
      you: [
        'Read the 8am briefing carefully. Write down: total sent, total replies, reply rate %, number of warm leads, any interested conversations. This is your Week 1 baseline.',
        'Go through every reply thread in full. For each warm lead: what do they actually want, what\'s their specific blocker, what\'s your exact next move?',
        'Message your 2 warmest leads personally: "Still thinking about it? Happy to sort it this week." Nothing more.',
      ],
      me: [
        'Full Week 1 stats breakdown — by city, by opener variant, by day of week. Clear recommendation on what to cut and what to scale.',
        'Identify top 10 leads closest to converting — flag them at the top of the leads dashboard',
        'Audit: did all scheduled jobs run correctly every day this week? Fix anything that silently failed.',
      ],
      openclaw: [
        'Week 1 follow-up sequences triggered for all leads gone cold',
        '8am: full week stats summary emailed to Dylan',
      ],
    },
  },
  {
    day: 8, date: '2026-06-11', label: 'Wed 11 Jun', week: 2,
    focus: 'Push for first deposit — Stripe link in hand, close someone this week',
    tasks: {
      you: [
        'Message your 3 warmest leads with the Stripe payment link. Keep it simple: "Ready when you are — here\'s the link to get it started: [link]. Just the £75 deposit today."',
        'Test your own Stripe link if you haven\'t already — make sure it actually works before sending it to a barber.',
        'Reply to every open thread today — clear your inbox completely.',
      ],
      me: [
        'Verify Stripe webhook is firing correctly by checking Railway logs',
        'Build the onboarding flow: when deposit received → auto-WhatsApp the barber confirming it\'s started → WhatsApp alert to Dylan',
        'Add payment status to the leads dashboard so you can see at a glance who\'s paid',
      ],
      openclaw: [
        '9am: batch 4 (10 messages)',
        'If any barber asks "how do I pay?" or "what\'s the next step?" → send Stripe link automatically',
        'Alert Dylan the moment a deposit lands in Stripe',
      ],
    },
  },
  {
    day: 9, date: '2026-06-12', label: 'Thu 12 Jun', week: 2,
    focus: 'Double down on the city getting the best reply rate',
    tasks: {
      you: [
        'Look at the city breakdown on the dashboard — which city has the highest reply rate? Spend 20 mins finding 10 more barbers from that city manually and message them yourself today.',
        'Check the enricher stats: how many leads now have email addresses? Is email outreach actually running?',
        'Go through every warm thread — push everyone to a decision. "Yes or no is fine, just let me know either way."',
      ],
      me: [
        'Generate 20 new WhatsApp messages targeting the highest-converting city',
        'Pull email stats: how many sent, any replies, any bounces?',
        'Audit all preview sites: are images loading? Are URLs working? Fix any broken ones.',
      ],
      openclaw: [
        '9am batch continues',
        'Email queue processing to all enriched leads',
        'Follow-ups running on all sent leads across both weeks',
      ],
    },
  },
  {
    day: 10, date: '2026-06-13', label: 'Fri 13 Jun', week: 2,
    focus: 'Friday closing push — make someone an offer they can\'t ignore',
    tasks: {
      you: [
        'Pick your single warmest lead and make a genuine offer: "Happy to knock the first month off if you get started this week." Say it like a person, not a sales pitch.',
        'Check your email replies — anyone respond to the automated emails? Reply personally to all of them.',
        'Look at your 5 warmest preview sites — would YOU pay £150 for one of those? If not, tell me which ones and I\'ll fix the template today.',
      ],
      me: [
        'Fix the 3 weakest preview sites Dylan flags — update template, redeploy, update URLs in DB',
        'Check full email delivery stats: sent vs bounced vs opened vs replied',
        'Write 2 new opener variants for Week 3 based on all data so far',
      ],
      openclaw: [
        'Friday batch sent',
        'Follow-ups sent to all leads 72h+ silent',
        'Weekend quiet mode starts tonight',
      ],
    },
  },
  {
    day: 11, date: '2026-06-14', label: 'Sat 14 Jun', week: 2,
    focus: 'Saturday — check alerts, close anyone who messages first',
    tasks: {
      you: [
        'Morning check only — 10 minutes. Read CEO briefing, scan Baz alerts.',
        'If anyone replies asking about payment or saying yes — respond immediately yourself. Don\'t leave it to Baz.',
      ],
      me: [
        'Nothing unless something breaks',
      ],
      openclaw: [
        'Quiet monitoring only — responding to inbound',
        'No proactive outreach today',
      ],
    },
  },
  {
    day: 12, date: '2026-06-15', label: 'Sun 15 Jun', week: 2,
    focus: 'Sunday — think about what to change in Week 3',
    tasks: {
      you: [
        'Respond to any warm leads who messaged over the weekend.',
        'Think: more volume, better messaging, different cities, or push harder on the warm leads you already have? Tell me tomorrow — that becomes the Week 3 plan.',
      ],
      me: [
        'Sunday health check — verify all crons fired correctly this week',
        'Prep full 2-week stats for Monday briefing',
      ],
      openclaw: [
        'Quiet mode — monitoring only',
        'No outreach today',
      ],
    },
  },
  {
    day: 13, date: '2026-06-16', label: 'Mon 16 Jun', week: 2,
    focus: 'Target 5 paying clients by end of week — close every open conversation',
    tasks: {
      you: [
        'Look at your warm leads list. Message every single one today — specific to their last message. Push for a yes or a no.',
        'Tell me which 5 leads have the most potential — one sentence on each. I\'ll write personalised closing messages for all 5.',
        'Check Stripe: any payments in? If yes — WhatsApp the barber yourself within 10 minutes to say you\'ve seen it and you\'re starting.',
      ],
      me: [
        'Write 5 personalised closing messages based on each warm lead\'s full conversation history',
        'Pull full 2-week stats — total sent, reply rate, conversion rate, revenue in',
        'Identify the 50 best leads to target in Week 3 based on city, quality score, and engagement',
      ],
      openclaw: [
        '9am batch: Week 3 opener variants running',
        'All follow-up sequences active across both weeks of leads',
        'Alert Dylan for every payment received — immediately',
      ],
    },
  },
  {
    day: 14, date: '2026-06-17', label: 'Tue 17 Jun', week: 2,
    focus: '2-week review — real numbers only, decide what Week 3 looks like',
    tasks: {
      you: [
        'Write down your actual numbers: total sent across both weeks, total replies, reply rate %, deposits paid, revenue in. No estimates — real numbers from the dashboard.',
        'Tell me one thing that worked and one thing that didn\'t. That\'s the only input I need to build the Week 3 plan.',
        'Message all remaining warm leads one final time — personal, short, honest. If they say no today, move on.',
      ],
      me: [
        'Full 2-week performance report: what worked by city, by variant, by channel',
        'Draft Week 3 plan based on real results — ready for Dylan immediately',
        'Flag the 15 leads most likely to convert in the first 3 days of Week 3',
      ],
      openclaw: [
        '8am: full 2-week summary emailed to Dylan',
        'All automated systems continue running into Week 3 without interruption',
      ],
    },
  },
]

const PEOPLE = [
  { key: 'you',      label: 'You',      color: C.gold,  panelBg: 'rgba(212,168,67,0.05)',  panelBorder: 'rgba(212,168,67,0.18)'  },
  { key: 'me',       label: 'Claude',   color: C.cyan,  panelBg: 'rgba(0,212,255,0.04)',   panelBorder: 'rgba(0,212,255,0.18)'   },
  { key: 'openclaw', label: 'OpenClaw', color: C.green, panelBg: 'rgba(0,255,136,0.04)',   panelBorder: 'rgba(0,255,136,0.18)'   },
]

function taskKey(day, person, idx) {
  return `plan_d${day}_${person}_${idx}`
}

function loadChecked() {
  try { return JSON.parse(localStorage.getItem('ld_plan_checked') || '{}') }
  catch { return {} }
}

function saveChecked(state) {
  localStorage.setItem('ld_plan_checked', JSON.stringify(state))
}

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
    <div style={{ padding: '24px', maxWidth: 920, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`, animation: 'orbBreathe 2s ease-in-out infinite' }} />
          <span style={lbl()}>2-WEEK OPERATIONS PLAN</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: C.text, margin: 0 }}>Strategy</h1>
        <p style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
          4 Jun – 17 Jun 2026 · First sale target · Gold = you · Cyan = Claude · Green = OpenClaw auto
        </p>
      </div>

      {/* Overall progress */}
      <div style={{ ...panelStyle({ padding: '14px 18px', marginBottom: 20 }) }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 12, color: C.textMid }}>Overall progress</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.gold, fontFamily: C.mono }}>{totalDone}/{totalTotal} tasks</span>
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
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: p.color, boxShadow: `0 0 5px ${p.color}50` }} />
                <span style={{ fontSize: 11, color: p.color, fontFamily: C.mono }}>{p.label}: {doneTasks}/{allTasks.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Today banner */}
      {todayDay && (
        <div
          style={{
            background: 'rgba(212,168,67,0.05)',
            border: '1px solid rgba(212,168,67,0.28)',
            borderRadius: 10,
            padding: '12px 16px',
            marginBottom: 20,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 0 20px rgba(212,168,67,0.05)',
          }}
          onClick={() => setExpandedDay(expandedDay === todayDay ? null : todayDay)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.gold, boxShadow: `0 0 6px ${C.gold}`, animation: 'orbBreathe 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: C.gold }}>Today</span>
            <span style={{ fontSize: 12, color: C.textMid }}>— {PLAN.find(d => d.day === todayDay)?.focus}</span>
          </div>
          <span style={{ fontSize: 11, color: `${C.gold}80`, fontFamily: C.mono }}>
            {dayProgress(todayDay).done}/{dayProgress(todayDay).total} done
          </span>
        </div>
      )}

      {[
        { label: 'WEEK 1 — GET THE SYSTEM RUNNING AND MAKE FIRST CONTACT', days: week1 },
        { label: 'WEEK 2 — CLOSE THE FIRST SALE AND LOCK IN THE PROCESS', days: week2 },
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

              const rowBg = isToday
                ? 'rgba(212,168,67,0.04)'
                : isComplete
                ? 'rgba(0,255,136,0.03)'
                : C.panel
              const rowBorder = isToday
                ? 'rgba(212,168,67,0.28)'
                : isComplete
                ? 'rgba(0,255,136,0.18)'
                : C.border

              return (
                <div
                  key={day.day}
                  style={{
                    background: rowBg,
                    border: `1px solid ${rowBorder}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <button
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                    }}
                    onClick={() => setExpandedDay(isExpanded ? null : day.day)}
                  >
                    <span style={{
                      fontSize: 11, fontWeight: 800, width: 22, textAlign: 'center',
                      color: isToday ? C.gold : isPast ? C.textDim : C.textMid,
                      fontFamily: C.mono,
                    }}>
                      {day.day}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{
                          fontSize: 13, fontWeight: 600,
                          color: isToday ? C.gold : isPast ? C.textMid : C.text,
                        }}>
                          {day.label}
                        </span>
                        {isToday && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 99,
                            background: C.gold, color: '#000', letterSpacing: '0.08em',
                          }}>TODAY</span>
                        )}
                        {isComplete && (
                          <span style={{ fontSize: 10, color: C.green }}>✓</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: C.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {day.focus}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {total > 0 && (
                        <span style={{ fontSize: 11, fontFamily: C.mono, color: done === total ? C.green : C.textDim }}>
                          {done}/{total}
                        </span>
                      )}
                      {total > 0 && (
                        <div style={{ width: 42, height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', borderRadius: 99,
                            background: isToday ? `linear-gradient(90deg, ${C.gold}, #F0C96A)` : isComplete ? C.green : `linear-gradient(90deg, ${C.cyan}, ${C.blue})`,
                            width: `${total > 0 ? (done / total) * 100 : 0}%`,
                            transition: 'width 0.4s ease',
                          }} />
                        </div>
                      )}
                      <span style={{ fontSize: 9, color: C.textDim }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div style={{
                      padding: '4px 16px 16px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                      gap: 10,
                    }}>
                      {PEOPLE.map(person => {
                        const tasks = day.tasks[person.key] || []
                        if (!tasks.length) return null
                        return (
                          <div
                            key={person.key}
                            style={{
                              background: person.panelBg,
                              border: `1px solid ${person.panelBorder}`,
                              borderRadius: 9,
                              padding: '12px 14px',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                              <div style={{ width: 5, height: 5, borderRadius: '50%', background: person.color, boxShadow: `0 0 5px ${person.color}60` }} />
                              <span style={{ ...lbl({ color: person.color, fontSize: 8 }) }}>{person.label}</span>
                            </div>
                            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {tasks.map((task, idx) => {
                                const key = taskKey(day.day, person.key, idx)
                                const done = checked[key]
                                return (
                                  <li
                                    key={idx}
                                    style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}
                                    onClick={() => toggle(day.day, person.key, idx)}
                                  >
                                    <div style={{
                                      marginTop: 2, width: 14, height: 14, flexShrink: 0, borderRadius: 4,
                                      border: `1px solid ${done ? person.color : 'rgba(255,255,255,0.2)'}`,
                                      background: done ? person.panelBg : 'transparent',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'all 0.15s ease',
                                      boxShadow: done ? `0 0 5px ${person.color}40` : 'none',
                                    }}>
                                      {done && <span style={{ fontSize: 8, color: person.color, fontWeight: 900 }}>✓</span>}
                                    </div>
                                    <span style={{
                                      fontSize: 11.5, lineHeight: 1.55,
                                      color: done ? C.textDim : C.textMid,
                                      textDecoration: done ? 'line-through' : 'none',
                                      transition: 'all 0.15s ease',
                                    }}>
                                      {task}
                                    </span>
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
