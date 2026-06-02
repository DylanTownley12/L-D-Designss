import { useState, useEffect } from 'react'

const PLAN = [
  {
    day: 1, date: '2026-06-03', label: 'Wed 3 Jun', week: 1,
    focus: 'Get WA back online + set friend up',
    tasks: {
      you: [
        'Scan QR at 3pm — ! openclaw channels login --channel whatsapp',
        'Give friend a list of 50 leads with phone numbers and opener script',
        '30 min: 15 Instagram DMs to barbers from your own account',
      ],
      me: [
        'Verify first batch sends cleanly after QR scan',
        'Check enricher ran at 6am and found Instagram handles',
      ],
      friend: [
        'Start today — send 15 manual WhatsApp DMs using the opener',
      ],
      openclaw: [
        'Back online, handling all inbound replies automatically',
        'Nudges anyone who goes quiet after 24h',
      ],
    },
  },
  {
    day: 2, date: '2026-06-04', label: 'Thu 4 Jun', week: 1,
    focus: 'Order SIMs — biggest leverage this week',
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
      ],
      openclaw: [
        'Auto-replying to all inbound',
      ],
    },
  },
  {
    day: 3, date: '2026-06-05', label: 'Fri 5 Jun', week: 1,
    focus: 'Post first TikTok',
    tasks: {
      you: [
        'Film a 60-second TikTok — screen record building a barber preview, show before/after',
        'Caption: "I built this barber a free website in 20 mins — messaged him on WhatsApp"',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Write 3 new WhatsApp opener variants based on reply data',
        'Check reply rate from week so far',
      ],
      friend: [
        'Send 15 DMs. Post the TikTok on their account too if they\'re up for it',
      ],
      openclaw: [
        'Running. Handling mid-conversation follow-ups',
      ],
    },
  },
  {
    day: 4, date: '2026-06-06', label: 'Sat 6 Jun', week: 1,
    focus: 'Improve the barber preview template',
    tasks: {
      you: [
        'Open 5 barber previews and look at them honestly — what looks weak?',
        'Decide: better headline, stronger social proof, sharper CTA',
      ],
      me: [
        'Implement the preview improvements you decide on',
        'Push to Railway',
      ],
      friend: [
        'Day off or keep DMing — their call',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 5, date: '2026-06-07', label: 'Sun 7 Jun', week: 1,
    focus: 'Research aesthetics clinics',
    tasks: {
      you: [
        'Find 20 aesthetics clinics on Instagram — Manchester, Liverpool, Leeds',
        'Note: follower count, do they have a booking link in bio, how active',
        'Don\'t message yet — just build the list',
      ],
      me: [
        'Nothing unless something breaks',
      ],
      friend: [
        'Day off',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 6, date: '2026-06-08', label: 'Mon 8 Jun', week: 1,
    focus: 'SIMs arrive — set up new WhatsApp accounts',
    tasks: {
      you: [
        'Set up WhatsApp on each SIM — text a few real contacts first to warm it up',
        'Wait 24h before outreach on new numbers',
        'Read through all this week\'s reply threads — spot patterns in objections',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Deploy new opener A/B variants',
        'Update Baz playbook if you\'ve spotted gaps in how he handles objections',
      ],
      friend: [
        'Keep going — 15 DMs/day',
      ],
      openclaw: [
        'Running with updated playbook if changed',
      ],
    },
  },
  {
    day: 7, date: '2026-06-09', label: 'Tue 9 Jun', week: 1,
    focus: 'Week 1 review',
    tasks: {
      you: [
        'Count total replies — what\'s the reply rate per opener?',
        'List the 5 warmest leads — people who replied but didn\'t convert',
        'Write down the top 3 objections you\'ve heard',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Pull full stats — template performance, reply rates, enricher results',
        'Give you a clean summary of what\'s working and what isn\'t',
      ],
      friend: [
        '15 DMs. Should have 100+ total sent by now',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 8, date: '2026-06-10', label: 'Wed 10 Jun', week: 2,
    focus: 'Personal follow-ups on warm leads',
    tasks: {
      you: [
        'Message the 5 warmest leads yourself — not through Baz',
        '"Hey, did you get a chance to look at the preview? Happy to change anything on it."',
        'New SIMs active today — 80 messages/day total now',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Start deploying aesthetics AI to Railway',
        'Set up VAPI trial account',
      ],
      friend: [
        'Keep going — 15 DMs/day',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 9, date: '2026-06-11', label: 'Thu 11 Jun', week: 2,
    focus: 'Aesthetics AI outreach starts',
    tasks: {
      you: [
        'DM 5 aesthetics clinics from your Sunday research list',
        '"Hey, I\'ve built an AI receptionist for aesthetics clinics — handles bookings and chases no-shows. Happy to show you a quick demo?"',
        '30 min: 15 barber Instagram DMs',
      ],
      me: [
        'Get aesthetics AI fully deployed and tested',
        'Do a test call via VAPI — voice, booking, and owner alert working end to end',
      ],
      friend: [
        'Keep DMing barbers',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 10, date: '2026-06-12', label: 'Fri 12 Jun', week: 2,
    focus: 'Aesthetics AI live',
    tasks: {
      you: [
        'Follow up on any aesthetics clinic replies',
        'Check in on warm barber leads — any close to paying?',
        '30 min: 15 Instagram DMs',
      ],
      me: [
        'Fix any bugs from VAPI test',
        'Build a simple aesthetics AI demo script — what to show, what to say',
      ],
      friend: [
        'Keep going',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 11, date: '2026-06-13', label: 'Sat 13 Jun', week: 2,
    focus: 'Second TikTok',
    tasks: {
      you: [
        'Post a second TikTok — "Building a web design agency at 17 from my bedroom"',
        'Authentic, honest, show the dashboard, show the automation',
        'This builds an audience while you build the business',
      ],
      me: [
        'Nothing unless there are bugs',
      ],
      friend: [
        'Day off or keep going',
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
        'Day off — check for any Baz alerts',
        'Think about what you\'ve learned — what would you do differently from day 1?',
      ],
      me: ['Nothing'],
      friend: ['Day off'],
      openclaw: ['Running'],
    },
  },
  {
    day: 13, date: '2026-06-15', label: 'Mon 15 Jun', week: 2,
    focus: 'Aesthetics clinic follow-ups',
    tasks: {
      you: [
        'Follow up on the 5 clinic DMs from Thursday',
        'Find 5 more aesthetics clinics and message them',
        '30 min: 15 barber Instagram DMs',
      ],
      me: [
        'Write the full aesthetics AI demo script',
        'Pricing recommendation for the aesthetics product',
      ],
      friend: [
        'Keep DMing barbers — should have 200+ total by now',
      ],
      openclaw: [
        'Running',
      ],
    },
  },
  {
    day: 14, date: '2026-06-16', label: 'Tue 16 Jun', week: 2,
    focus: 'End of 2-week plan — review and plan week 3',
    tasks: {
      you: [
        'Count results: deposits received, warm leads, aesthetics clinic interest',
        'Decide: double down on barbers, push aesthetics, or both?',
        'Message me and we\'ll plan the next 2 weeks based on what worked',
      ],
      me: [
        'Full stats review — reply rates, conversion, what channels worked',
        'Draft week 3 plan based on results',
      ],
      friend: [
        'Review together — what messages got the best responses?',
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
