import { useState, useEffect } from 'react'

const PLAN = [
  {
    day: 1, date: '2026-06-03', label: 'Wed 3 Jun', week: 1,
    focus: 'Get WA back + both of you set up and building',
    tasks: {
      you: [
        'Scan QR at 3pm — ! openclaw channels login --channel whatsapp',
        'Give friend access to the GitHub repo and Railway dashboard',
        '30 min: 15 Instagram DMs to barbers from your own account',
      ],
      me: [
        'Verify first batch sends cleanly after QR scan',
        'Check enricher ran at 6am and found Instagram handles',
      ],
      friend: [
        'Clone the L&D repo and get Claude Code running on it',
        'Send 15 manual WhatsApp DMs using the opener Dylan gives you',
        'Use Claude Code to run the lead finder — ask it to find 100 more barbers in a new city',
        'Check the leads came in on the dashboard',
      ],
      openclaw: [
        'Back online, handling all inbound replies automatically',
        'Nudges anyone who goes quiet after 24h',
      ],
    },
  },
  {
    day: 2, date: '2026-06-04', label: 'Thu 4 Jun', week: 1,
    focus: 'Order SIMs + friend builds their first feature',
    tasks: {
      you: [
        'Order 3 PAYG SIMs — Giffgaff or Lebara, £1 each',
        'Check 9am batch sent — verify in outreach logs',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Pull template stats — kill worst opener, write 2 new A/B variants',
      ],
      friend: [
        'Send 15 manual WhatsApp DMs',
        'Use Claude Code to build a Facebook Groups scraper — find barbers posting in "barbers UK" groups',
        'This is a new lead source the main system doesn\'t have yet — adds to the pipeline',
      ],
      openclaw: [
        'Auto-replying to all inbound',
      ],
    },
  },
  {
    day: 3, date: '2026-06-05', label: 'Fri 5 Jun', week: 1,
    focus: 'TikTok + friend builds aesthetics AI landing page',
    tasks: {
      you: [
        'Film a 60-second TikTok — screen record building a barber preview, show before/after',
        'Caption: "I built this barber a free website in 20 mins — messaged him on WhatsApp"',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Write 3 new WhatsApp opener variants based on reply data',
        'Check reply rate from the week so far',
      ],
      friend: [
        'Send 15 DMs. Post the TikTok on their account too',
        'Use Claude Code to build a landing page for the aesthetics AI product',
        'Single page: headline, what it does, pricing placeholder, "book a demo" button',
        'Deploy to Vercel — this is what you send clinics when they ask for more info',
      ],
      openclaw: [
        'Running. Handling mid-conversation follow-ups',
      ],
    },
  },
  {
    day: 4, date: '2026-06-06', label: 'Sat 6 Jun', week: 1,
    focus: 'Preview improvements + friend deploys aesthetics AI backend',
    tasks: {
      you: [
        'Open 5 barber previews — decide what needs improving (headline, images, CTA)',
        'Tell me what to change and I\'ll implement it',
      ],
      me: [
        'Implement preview improvements',
        'Push to Railway',
      ],
      friend: [
        'Use Claude Code to deploy the aesthetics AI backend to Railway',
        'Create a new Railway project, set the env vars from .env.example',
        'Run the Supabase migrations for the aesthetics DB',
        'Verify /health endpoint returns ok',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 5, date: '2026-06-07', label: 'Sun 7 Jun', week: 1,
    focus: 'Research + VAPI setup',
    tasks: {
      you: [
        'Find 20 aesthetics clinics on Instagram — Manchester, Liverpool, Leeds',
        'Note: follower count, booking link in bio, how active they are',
        'Don\'t message yet — just build the list',
      ],
      me: [
        'Nothing unless something breaks',
      ],
      friend: [
        'Sign up for VAPI.ai free trial',
        'Use Claude Code to call POST /api/calls/setup-assistant/glow-manchester on the deployed aesthetics backend',
        'Do a test call to the VAPI number — does Sophie answer? Does she sound right?',
        'Note any issues for fixing Monday',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 6, date: '2026-06-08', label: 'Mon 8 Jun', week: 1,
    focus: 'SIMs arrive + fix anything broken from weekend',
    tasks: {
      you: [
        'Set up WhatsApp on each new SIM — text a few real contacts first to warm up',
        'Wait 24h before outreach on new numbers',
        'Read through all reply threads — spot patterns in objections',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Deploy new A/B opener variants',
        'Update Baz playbook if objection patterns spotted',
      ],
      friend: [
        'Fix any VAPI issues from Sunday test',
        'Use Claude Code to wire up Cal.com to the test clinic — real availability check working',
        'Send 15 manual DMs',
      ],
      openclaw: [
        'Running with updated playbook if changed',
      ],
    },
  },
  {
    day: 7, date: '2026-06-09', label: 'Tue 9 Jun', week: 1,
    focus: 'Week 1 review — both of you',
    tasks: {
      you: [
        'Count total replies — what\'s the reply rate per opener?',
        'List the 5 warmest leads',
        'Write down the top 3 objections barbers give',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Pull full stats — template performance, reply rates, enricher results',
        'Clean summary of what\'s working',
      ],
      friend: [
        'Review landing page — does it explain the aesthetics product clearly? Update copy',
        'Use Claude Code to add a simple "demo request" form that emails you when someone fills it in',
        '15 DMs — should have 100+ total sent now',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 8, date: '2026-06-10', label: 'Wed 10 Jun', week: 2,
    focus: 'Personal follow-ups + aesthetics AI voice tested end-to-end',
    tasks: {
      you: [
        'Message the 5 warmest barber leads yourself — not through Baz',
        '"Hey, did you get a chance to look at the preview? Happy to change anything."',
        'New SIMs active — 80 messages/day total now',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Review aesthetics AI deployment — fix any gaps',
        'Write the full demo script for the aesthetics product',
      ],
      friend: [
        'Do a full end-to-end test call on the aesthetics AI',
        'Call the VAPI number, try to book an appointment, check Cal.com, check Stripe link sent',
        'Test the under-18 refusal — say you\'re 16 wanting Botox',
        'Test the medical question refusal — ask "is it safe with my medication?"',
        'Log every bug in a note and fix them with Claude Code',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 9, date: '2026-06-11', label: 'Thu 11 Jun', week: 2,
    focus: 'Aesthetics outreach starts — both channels',
    tasks: {
      you: [
        'DM 5 aesthetics clinics from your Sunday list',
        '"Hey, built an AI receptionist for aesthetics clinics — handles bookings, chases no-shows. Happy to show you a demo?"',
        '30 min: 15 barber Instagram DMs',
      ],
      me: [
        'Fix any bugs from friend\'s end-to-end test',
        'Make sure owner WhatsApp alerts are firing correctly',
      ],
      friend: [
        'DM 5 different aesthetics clinics — split the list so you\'re not doubling up',
        'Use Claude Code to build a simple dashboard page for the aesthetics AI — shows bookings, calls, no-shows per clinic',
        'Send 15 barber DMs',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 10, date: '2026-06-12', label: 'Fri 12 Jun', week: 2,
    focus: 'Polish and follow-ups',
    tasks: {
      you: [
        'Follow up on aesthetics clinic replies',
        'Check warm barber leads — any close to paying?',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Review and improve the aesthetics AI system prompt based on test call findings',
        'Add any missing FAQ handling',
      ],
      friend: [
        'Follow up on their 5 aesthetics clinic DMs',
        'Use Claude Code to add SMS reminders to the aesthetics AI — 24h and 2h before appointment',
        'Test a reminder fires correctly',
        'Send 15 barber DMs',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 11, date: '2026-06-13', label: 'Sat 13 Jun', week: 2,
    focus: 'Content day',
    tasks: {
      you: [
        'Post second TikTok — "Building a web design agency at 17 from my bedroom"',
        'Authentic, show the dashboard and automation, honest about the journey',
      ],
      me: [
        'Nothing unless there are bugs',
      ],
      friend: [
        'Post their own TikTok — "Helping my mate build an AI business, here\'s what we\'ve built"',
        'Different angle, different audience — doubles the reach',
        'Use Claude Code to build the no-show recovery flow — mark no-shows and auto-text to rebook',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 12, date: '2026-06-14', label: 'Sun 14 Jun', week: 2,
    focus: 'Rest + review',
    tasks: {
      you: [
        'Day off — check for any Baz 🔥 alerts',
        'Think about what you\'d do differently from day 1',
      ],
      me: ['Nothing'],
      friend: [
        'Day off',
        'Optional: use Claude Code to run the reactivation flow on the test clinic — check it sends correctly',
      ],
      openclaw: ['Running'],
    },
  },
  {
    day: 13, date: '2026-06-15', label: 'Mon 15 Jun', week: 2,
    focus: 'Aesthetics follow-ups + monthly ROI report working',
    tasks: {
      you: [
        'Follow up on all 10 clinic DMs (yours + friend\'s)',
        'Find 5 more clinics and message them',
        '30 min: 15 barber Instagram DMs',
      ],
      me: [
        'Pricing recommendations for aesthetics AI — what to charge',
        'Draft the aesthetics AI sales pitch in 3 sentences',
      ],
      friend: [
        'Use Claude Code to get the monthly ROI report working — POST /api/dashboard/{clinic_id}/monthly-report',
        'Verify the WhatsApp summary sends to the owner number',
        'DM 5 more aesthetics clinics',
        'Send 15 barber DMs',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 14, date: '2026-06-16', label: 'Tue 16 Jun', week: 2,
    focus: 'End of 2-week plan — review together',
    tasks: {
      you: [
        'Count results: deposits, warm leads, aesthetics clinic interest',
        'Decide together: double down on barbers, push aesthetics, or both?',
        'Message me and we\'ll plan week 3',
      ],
      me: [
        'Full stats review — all channels, conversion rates, what worked',
        'Draft week 3 plan based on results',
      ],
      friend: [
        'Review together — what messages got the best response?',
        'Is the aesthetics AI demo-ready? Could you show it to a real clinic today?',
        'Use Claude Code to write up a summary of everything built in 2 weeks',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
]

const PEOPLE = [
  { key: 'you',      label: 'You',       color: 'text-gold',        bg: 'bg-gold/10',      border: 'border-gold/20'    },
  { key: 'me',       label: 'Claude',    color: 'text-blue-400',    bg: 'bg-blue-400/10',  border: 'border-blue-400/20' },
  { key: 'friend',   label: 'Friend',    color: 'text-purple-400',  bg: 'bg-purple-400/10', border: 'border-purple-400/20' },
  { key: 'openclaw', label: 'OpenClaw',  color: 'text-green-400',   bg: 'bg-green-400/10', border: 'border-green-400/20' },
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
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">2-Week Plan</h1>
        <p className="text-white/40 text-sm">3 Jun – 16 Jun 2026 · First sale target</p>
      </div>

      {/* Overall progress */}
      <div className="bg-dark-2 border border-white/6 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-white/60">Overall progress</span>
          <span className="text-sm font-bold text-gold">{totalDone}/{totalTotal} tasks</span>
        </div>
        <div className="w-full bg-white/5 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: '#C9A84C' }}
          />
        </div>
        <div className="flex gap-4 mt-3">
          {PEOPLE.map(p => {
            const allTasks = PLAN.flatMap(d => (d.tasks[p.key] || []).map((_, i) => taskKey(d.day, p.key, i)))
            const doneTasks = allTasks.filter(k => checked[k]).length
            return (
              <div key={p.key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${p.bg} border ${p.border}`} />
                <span className={`text-xs ${p.color}`}>{p.label}: {doneTasks}/{allTasks.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Today banner */}
      {todayDay && (
        <div
          className="bg-gold/10 border border-gold/30 rounded-xl p-3 mb-6 cursor-pointer flex items-center justify-between"
          onClick={() => setExpandedDay(expandedDay === todayDay ? null : todayDay)}
        >
          <div className="flex items-center gap-2">
            <span className="text-gold text-sm font-bold">Today</span>
            <span className="text-white/60 text-sm">— {PLAN.find(d => d.day === todayDay)?.focus}</span>
          </div>
          <span className="text-gold/60 text-xs">
            {dayProgress(todayDay).done}/{dayProgress(todayDay).total} done
          </span>
        </div>
      )}

      {[{ label: 'Week 1 — Get the machine running and close the first sale', days: week1 },
        { label: 'Week 2 — Push for first sale + build aesthetics demo', days: week2 }
      ].map(week => (
        <div key={week.label} className="mb-8">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-3">{week.label}</h2>
          <div className="space-y-2">
            {week.days.map(day => {
              const { done, total } = dayProgress(day.day)
              const isToday = day.day === todayDay
              const isExpanded = expandedDay === day.day
              const isPast = todayDay && day.day < todayDay

              return (
                <div
                  key={day.day}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isToday
                      ? 'border-gold/30 bg-gold/5'
                      : isPast && done === total && total > 0
                      ? 'border-green-400/20 bg-green-400/5'
                      : 'border-white/6 bg-dark-2'
                  }`}
                >
                  {/* Day header */}
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedDay(isExpanded ? null : day.day)}
                  >
                    <div className={`text-xs font-bold w-6 text-center rounded ${isToday ? 'text-gold' : 'text-white/25'}`}>
                      {day.day}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${isToday ? 'text-gold' : isPast ? 'text-white/50' : 'text-white/80'}`}>
                          {day.label}
                        </span>
                        {isToday && <span className="text-xs bg-gold text-black font-bold px-1.5 py-0.5 rounded">Today</span>}
                      </div>
                      <div className="text-xs text-white/30 mt-0.5 truncate">{day.focus}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {done > 0 && (
                        <span className={`text-xs ${done === total ? 'text-green-400' : 'text-white/40'}`}>
                          {done}/{total}
                        </span>
                      )}
                      <span className="text-white/20 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Expanded tasks */}
                  {isExpanded && (
                    <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {PEOPLE.map(person => {
                        const tasks = day.tasks[person.key] || []
                        if (!tasks.length) return null
                        return (
                          <div key={person.key} className={`rounded-lg border p-3 ${person.bg} ${person.border}`}>
                            <div className={`text-xs font-bold mb-2 ${person.color}`}>{person.label}</div>
                            <ul className="space-y-2">
                              {tasks.map((task, idx) => {
                                const key = taskKey(day.day, person.key, idx)
                                const done = checked[key]
                                return (
                                  <li
                                    key={idx}
                                    className="flex items-start gap-2 cursor-pointer"
                                    onClick={() => toggle(day.day, person.key, idx)}
                                  >
                                    <div className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-all ${
                                      done
                                        ? `${person.bg} ${person.border}`
                                        : 'border-white/20 bg-transparent'
                                    }`}>
                                      {done && <span className={`text-xs ${person.color}`}>✓</span>}
                                    </div>
                                    <span className={`text-xs leading-relaxed ${done ? 'line-through text-white/25' : 'text-white/70'}`}>
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
